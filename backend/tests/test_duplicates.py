"""Regression and boundary coverage for identifier-aware exact duplicates."""

import pandas as pd
import pytest

from app.analysis import profile
from app.duplicates import detect_duplicates
from app.models import Settings
from app.parsing import DataError, parse_csv

CSV = """customer_id,name,email,age,signup_date,country,plan,monthly_spend,last_login,active
1007,Sam,sam@example.test,30,2025-01-01,US,Pro,25,2025-02-01,true
1008,Sam,sam@example.test,30,2025-01-01,US,Pro,25,2025-02-01,true
1016,Alex,alex@example.test,40,2025-01-02,UK,Basic,15,2025-02-02,false
1017,Alex,alex@example.test,40,2025-01-02,UK,Basic,15,2025-02-02,false
1018,Taylor,taylor@example.test,25,2025-01-03,CA,Pro,35,2025-02-03,true
"""


def test_two_business_duplicate_pairs():
    frame = parse_csv(CSV.encode(), "synthetic.csv")
    report = profile(frame, "synthetic.csv", len(CSV), Settings())
    details = report.duplicate_detection
    assert report.duplicate_count == details["duplicate_count"] == 2
    assert report.duplicate_percentage == 40
    assert report.components["Uniqueness"] == 60
    assert details["excluded_columns"] == ["customer_id"]
    assert details["matched_columns"] == list(frame.columns[1:])
    decision = details["column_decisions"][0]
    assert decision["excluded"] and "100% unique" in decision["reason"]
    assert [g["row_indices"] for g in details["groups"]] == [[0, 1], [2, 3]]
    assert [g["row_numbers"] for g in details["groups"]] == [[2, 3], [4, 5]]
    assert [[r["customer_id"] for r in g["identifiers"]] for g in details["groups"]] == [
        ["1007", "1008"],
        ["1016", "1017"],
    ]
    for i, group in enumerate(details["groups"], 1):
        assert group["group_id"] == i and group["size"] == 2
        assert group["matched_columns"] == list(frame.columns[1:])
        assert group["excluded_columns"] == ["customer_id"]
    included, info = detect_duplicates(
        frame, Settings(duplicate_column_overrides={"customer_id": "include"})
    )
    assert included.sum() == 0 and info["groups"] == []
    assert "customer_id" in info["matched_columns"]
    full, _ = detect_duplicates(frame, Settings(duplicate_auto_exclude_ids=False))
    assert full.sum() == 0


def test_force_exclude_and_unique_business_field():
    frame = pd.DataFrame({"row_id": ["a", "b"], "amount": ["10", "20"], "name": ["Sam", "Sam"]})
    mask, result = detect_duplicates(frame, Settings())
    assert mask.sum() == 0
    assert "amount" in result["matched_columns"]  # Unique measurements are not keys.
    mask, result = detect_duplicates(
        frame, Settings(duplicate_column_overrides={"amount": "exclude"})
    )
    assert mask.sum() == 1
    assert result["excluded_columns"] == ["row_id", "amount"]
    assert result["column_decisions"][1]["reason"] == "Explicit user override"
    with pytest.raises(DataError, match="Unknown duplicate override columns"):
        detect_duplicates(frame, Settings(duplicate_column_overrides={"missing": "exclude"}))
    with pytest.raises(ValueError):
        Settings(duplicate_column_overrides={"amount": "invalid"})


@pytest.mark.parametrize(
    "name",
    [
        "id",
        "record_id",
        "UUID",
        "guid",
        "key",
        "primary_key",
        "pk",
        "row_number",
        "rownum",
        "index",
        "accountId",
    ],
)
def test_general_identifier_names(name):
    mask, result = detect_duplicates(
        pd.DataFrame({name: ["1", "2"], "value": ["same", "same"]}), Settings()
    )
    assert mask.sum() == 1 and result["excluded_columns"] == [name]


def test_no_keys_nulls_mixed_values_and_nondefault_index():
    frame = pd.DataFrame({"value": [1, 1, "1", "1"], "empty": [None] * 4}, index=[8, 8, 2, 1])
    mask, result = detect_duplicates(frame, Settings())
    assert mask.sum() == 2 and result["excluded_columns"] == []
    assert [g["row_indices"] for g in result["groups"]] == [[0, 1], [2, 3]]
    # Incomplete identifiers are conservatively retained; callers can override.
    frame = pd.DataFrame({"id": [None, "1", "2"], "value": ["x", "x", "x"]})
    mask, result = detect_duplicates(frame, Settings())
    assert mask.sum() == 0 and result["excluded_columns"] == []


def test_multiple_identifiers_and_empty_comparison():
    frame = pd.DataFrame({"id": ["1", "2"], "row_key": ["a", "b"], "value": ["x", "x"]})
    mask, result = detect_duplicates(frame, Settings())
    assert mask.sum() == 1 and result["excluded_columns"] == ["id", "row_key"]
    mask, result = detect_duplicates(frame.drop(columns="value"), Settings())
    assert mask.sum() == 0 and not result["evaluated"] and result["note"]
    # Compound keys with repeating components are retained absent an override.
    frame = pd.DataFrame({"account_id": ["a", "a"], "transaction_id": ["t", "t"], "v": ["x", "x"]})
    mask, result = detect_duplicates(frame, Settings())
    assert mask.sum() == 1 and result["excluded_columns"] == []


@pytest.mark.parametrize(
    "frame",
    [
        pd.DataFrame(),
        pd.DataFrame(columns=["id", "value"]),
        pd.DataFrame({"id": ["1"], "value": ["x"]}),
    ],
)
def test_empty_and_single_rows(frame):
    mask, result = detect_duplicates(frame, Settings())
    assert mask.sum() == 0 and result["groups"] == []
