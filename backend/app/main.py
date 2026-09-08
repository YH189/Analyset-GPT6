"""Local/session FastAPI application. Run one worker; reports expire in memory."""

import csv
import io
import json
import logging
import os
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from .analysis import profile
from .drift import compare
from .limits import BodyLimitMiddleware, DemoGuardMiddleware
from .models import Analysis, CompareRequest, Comparison, Settings
from .parsing import MAX_BYTES, DataError, parse_csv, safe_name
from .reports import pdf_report

app = FastAPI(title="AnalySet", version="1.0.0")
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(
    DemoGuardMiddleware, requests_per_minute=int(os.getenv("DEMO_REQUESTS_PER_MINUTE", "0"))
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(
        ","
    ),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Session-ID"],
)
store: OrderedDict = OrderedDict()
lock = threading.RLock()
analysis_gate = threading.Semaphore(1)
MAX_REPORTS = int(os.getenv("MAX_REPORTS", "20"))
TTL = int(os.getenv("REPORT_TTL_SECONDS", "3600"))
# Aggregate memory cap in addition to count/TTL limits. Frames are retained for comparison.
MAX_MEMORY = int(os.getenv("MAX_MEMORY_MB", "512")) * 1024 * 1024
Session = Annotated[str, Header(alias="X-Session-ID", min_length=20, max_length=100)]


@app.exception_handler(HTTPException)
async def http_error(_request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": "HTTP_ERROR", "message": str(exc.detail)}},
    )


@app.exception_handler(DataError)
async def data_error(_request, exc):
    return JSONResponse(
        status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}}
    )


@app.exception_handler(RequestValidationError)
async def request_error(_request, _exc):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "INVALID_REQUEST",
                "message": "Check request fields and include a valid session identifier.",
            }
        },
    )


@app.exception_handler(Exception)
async def unexpected_error(_request, exc):
    logging.getLogger("analyset").exception("Analysis request failed", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Analysis could not finish. Try a smaller file or check the server logs.",
            }
        },
    )


@app.middleware("http")
async def upload_guard(request, call_next):
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_BYTES + 1024 * 1024):
        return JSONResponse(
            status_code=413,
            content={
                "error": {"code": "FILE_TOO_LARGE", "message": "Request exceeds the upload limit."}
            },
        )
    return await call_next(request)


def clean_store():
    now = time.time()
    for key in list(store):
        if now - store[key]["created"] > TTL:
            del store[key]


def get_entry(identifier: str, session: str):
    with lock:
        clean_store()
        item = store.get((session, identifier))
        if item is None:
            raise DataError(
                "REPORT_NOT_FOUND",
                "Report expired or is unavailable in this session. Analyze the file again.",
                404,
            )
        return item


def analyze_data(data: bytes, filename: str, settings: Settings, session: str):
    if not analysis_gate.acquire(blocking=False):
        raise DataError("SERVER_BUSY", "Another analysis is running. Try again shortly.", 429)
    try:
        frame = parse_csv(data, filename)
        if int(frame.memory_usage(deep=True).sum()) > MAX_MEMORY:
            raise DataError(
                "ANALYSIS_LIMIT",
                "This dataset exceeds the in-memory analysis budget. Use a smaller dataset.",
                413,
            )
        report = profile(frame, safe_name(filename), len(data), settings)
        with lock:
            clean_store()
            while store and (
                len(store) >= MAX_REPORTS
                or sum(v["report"].memory_usage for v in store.values()) + report.memory_usage
                > MAX_MEMORY
            ):
                store.popitem(last=False)
            store[(session, report.id)] = {
                "report": report,
                "frame": frame,
                "created": time.time(),
                "drift": None,
            }
        return report
    finally:
        analysis_gate.release()


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/datasets/analyze", response_model=Analysis)
async def analyze(session: Session, file: UploadFile = File(...), settings: str = Form("{}")):
    try:
        if file.content_type not in {
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
            "text/plain",
            "application/octet-stream",
        }:
            raise DataError("INVALID_MIME", "Upload a CSV text file.")
        data = await file.read(MAX_BYTES + 1)
        try:
            config = Settings.model_validate_json(settings)
        except ValidationError as exc:
            raise DataError(
                "INVALID_SETTINGS",
                "Check settings: weights must total 100 and IQR multiplier must be between 0.5 and 5.",
            ) from exc
        return await run_in_threadpool(analyze_data, data, file.filename or "", config, session)
    finally:
        await file.close()


@app.post("/api/datasets/sample/{name}", response_model=Analysis)
def sample(name: str, session: Session):
    if name not in {"clean", "problematic", "baseline", "drifted"}:
        raise DataError("SAMPLE_NOT_FOUND", "Choose an available sample dataset.", 404)
    path = Path(__file__).resolve().parent / "sample_data" / f"customers_{name}.csv"
    return analyze_data(path.read_bytes(), path.name, Settings(), session)


@app.get("/api/analysis/{analysis_id}", response_model=Analysis)
@app.get("/api/report/{analysis_id}", response_model=Analysis)
def report(analysis_id: str, session: Session):
    return get_entry(analysis_id, session)["report"]


@app.post("/api/datasets/compare", response_model=Comparison)
@app.post("/api/drift/analyze", response_model=Comparison)
def comparison(request: CompareRequest, session: Session):
    a, b = get_entry(request.baseline_id, session), get_entry(request.current_id, session)
    result = compare(a["report"], b["report"], a["frame"], b["frame"], request.sensitivity)
    with lock:
        b["drift"] = result
    return result


def csv_safe(value):
    value = str(value)
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value


@app.post("/api/report/{analysis_id}/export")
def export(analysis_id: str, session: Session, format: str = "pdf"):
    item = get_entry(analysis_id, session)
    report, drift = item["report"], item["drift"]
    if format == "pdf":
        data, mime = pdf_report(report, drift), "application/pdf"
    elif format == "json":
        data = json.dumps(
            {"analysis": report.model_dump(), "comparison": drift.model_dump() if drift else None},
            allow_nan=False,
        ).encode()
        mime = "application/json"
    elif format == "csv":
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(
            [
                "Column",
                "Issue Type",
                "Severity",
                "Rows Affected",
                "Affected %",
                "Description",
                "Suggested Fix",
            ]
        )
        for issue in report.issues:
            writer.writerow(
                [
                    csv_safe(v)
                    for v in [
                        issue.column,
                        issue.issue_type,
                        issue.severity,
                        issue.affected_rows,
                        issue.affected_percentage,
                        issue.description,
                        issue.suggested_fix,
                    ]
                ]
            )
        data, mime = output.getvalue().encode("utf-8-sig"), "text/csv"
    else:
        raise DataError("INVALID_FORMAT", "Choose pdf, json or csv.")
    return Response(
        data,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="analyset-{report.id[:8]}.{format}"'
        },
    )
