import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.analysis import profile
from app.drift import compare
from app.main import app
from app.models import Settings
from app.parsing import DataError, parse_csv

client = TestClient(app)
HEADERS = {"X-Session-ID": "test-session-123456789012345"}


def analyze(text):
    return profile(parse_csv(text.encode(), "test.csv"), "test.csv", len(text), Settings())


@pytest.mark.parametrize(
    "text,code",
    [
        ("", "EMPTY_FILE"),
        ("a,b\n", "NO_ROWS"),
        ("a,a\n1,2", "DUPLICATE_HEADERS"),
        (",b\n1,2", "MISSING_HEADERS"),
        ("a,b\n1,2,3", "MALFORMED_CSV"),
        ('a,b\n"oops,2', "MALFORMED_CSV"),
        ("a;b\n1;2", "INVALID_DELIMITER"),
        ("1,2\n3,4", "MISSING_HEADERS"),
    ],
)
def test_parser_errors(text, code):
    with pytest.raises(DataError) as exc:
        parse_csv(text.encode(), "data.csv")
    assert exc.value.code == code


def test_clean_profile():
    report = analyze("age,value\n20,10\n30,20\n40,30")
    assert report.quality_score == 100
    assert report.row_count == 3
    assert report.columns[0]["mean"] == 30
    assert report.columns[0]["std"] == 10
    assert report.columns[0]["q1"] == 25


def test_missing_duplicates_and_all_null():
    r = analyze("age,empty\n10,\n10,\n,")
    assert r.missing_count == 4
    assert r.duplicate_count == 1
    assert any(i.issue_type == "All-null column" for i in r.issues)
    assert 0 <= r.quality_score <= 100
    assert r.quality_score == round(
        sum(r.components[k] * r.settings.weights[k] / 100 for k in r.components), 2
    )


def test_outliers_and_invalid_values():
    r = analyze(
        "age,revenue,date\n20,10,2025-01-01\n21,11,2025-01-02\n22,12,2025-01-03\n23,13,bad\nunknown,14,2025-01-05\n24,9999,2025-01-06\n25,inf,2025-01-07"
    )
    kinds = {i.issue_type for i in r.issues}
    assert {"Mixed datatype", "Statistical outlier", "Infinite values", "Invalid date"} <= kinds
    assert r.columns[1]["outlier_count"] == 1
    assert r.columns[1]["max"] == 9999


def test_score_settings():
    with pytest.raises(ValueError):
        Settings(iqr_multiplier=0)
    with pytest.raises(ValueError):
        Settings(weights={"Completeness": 100})
    assert 0 <= analyze("a,b\n,\n,").quality_score <= 100


def test_drift_and_comparison():
    root = Path(__file__).resolve().parents[2] / "sample-data"
    frames, reports = [], []
    for name in ["baseline", "drifted"]:
        data = (root / f"customers_{name}.csv").read_bytes()
        f = parse_csv(data, "data.csv")
        frames.append(f)
        reports.append(profile(f, name, len(data), Settings()))
    result = compare(*reports, *frames, "standard")
    assert result.overall == "High"
    assert result.drifted >= 3
    assert any(c["method"] == "KS D" and c["statistic"] > 0.5 for c in result.columns)
    assert any(c["method"].startswith("JS") and c["statistic"] > 0.1 for c in result.columns)
    same = compare(reports[0], reports[0], frames[0], frames[0], "standard")
    assert same.overall == "Low"
    assert same.drifted == 0


def test_small_samples_and_schema():
    a, b = "a,x\n1,a\n2,b", "a,y\n1,a\n2,b"
    ra, rb = analyze(a), analyze(b)
    result = compare(
        ra, rb, parse_csv(a.encode(), "a.csv"), parse_csv(b.encode(), "b.csv"), "standard"
    )
    assert result.analyzed == 0
    assert result.added_columns == ["y"]
    assert result.removed_columns == ["x"]


def test_api_upload_and_exports():
    r = client.post(
        "/api/datasets/analyze",
        headers=HEADERS,
        files={"file": ("data.csv", io.BytesIO(b"age\n20\n30"), "text/csv")},
    )
    assert r.status_code == 200, r.text
    identifier = r.json()["id"]
    assert client.get(f"/api/analysis/{identifier}", headers=HEADERS).status_code == 200
    for format in ["pdf", "json", "csv"]:
        exported = client.post(f"/api/report/{identifier}/export?format={format}", headers=HEADERS)
        assert exported.status_code == 200
        if format == "pdf":
            assert exported.content.startswith(b"%PDF")
    assert (
        client.get(
            f"/api/analysis/{identifier}", headers={"X-Session-ID": "another-session-123456789"}
        ).status_code
        == 404
    )


def test_api_errors():
    assert client.get("/api/health").json()["status"] == "ok"
    for name, content in [
        ("bad.txt", b"a\n1"),
        ("empty.csv", b""),
        ("bad.csv", b"a,b\n1"),
        ("bad.csv", b"\xff"),
    ]:
        r = client.post(
            "/api/datasets/analyze", headers=HEADERS, files={"file": (name, content, "text/csv")}
        )
        assert r.status_code == 422
        assert "message" in r.json()["error"]
    r = client.post(
        "/api/datasets/analyze",
        headers=HEADERS,
        files={"file": ("ok.csv", b"a\n1", "text/csv")},
        data={"settings": '{"iqr_multiplier":-1}'},
    )
    assert r.json()["error"]["code"] == "INVALID_SETTINGS"


def test_sample_and_compare_api():
    a = client.post("/api/datasets/sample/baseline", headers=HEADERS).json()
    b = client.post("/api/datasets/sample/drifted", headers=HEADERS).json()
    result = client.post(
        "/api/datasets/compare",
        headers=HEADERS,
        json={"baseline_id": a["id"], "current_id": b["id"]},
    )
    assert result.status_code == 200
    assert result.json()["overall"] == "High"
    pdf = client.post(f"/api/report/{b['id']}/export", headers=HEADERS)
    assert pdf.content.startswith(b"%PDF")


def test_extreme_numbers_return_readable_error():
    with pytest.raises(DataError, match="Rescale"):
        analyze("value\n1e308\n-1e308")


def test_upload_header_limit():
    r = client.post("/api/datasets/analyze", headers={**HEADERS, "Content-Length": "999999999"})
    assert r.status_code == 413
    assert "error" in r.json()


def test_limits_extension_width_and_settings(monkeypatch):
    import app.parsing as parser

    with pytest.raises(DataError, match=".csv"):
        parse_csv(b"a\n1", "x.exe")
    monkeypatch.setattr(parser, "MAX_COLUMNS", 1)
    with pytest.raises(DataError) as exc:
        parse_csv(b"a,b\n1,2", "x.csv")
    assert exc.value.code == "TOO_WIDE"
    monkeypatch.setattr(parser, "MAX_BYTES", 2)
    with pytest.raises(DataError) as exc:
        parse_csv(b"a\n123", "x.csv")
    assert exc.value.status == 413


def test_streaming_request_limit(monkeypatch):
    import asyncio

    from starlette.exceptions import HTTPException

    import app.limits as limits

    monkeypatch.setattr(limits, "MAX_BYTES", 1)

    async def receive():
        return {"type": "http.request", "body": b"x" * (1024 * 1024 + 2)}

    async def downstream(_scope, reader, _send):
        await reader()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(limits.BodyLimitMiddleware(downstream)({"type": "http"}, receive, None))
    assert exc.value.status_code == 413
