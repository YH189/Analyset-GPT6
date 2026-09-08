"""Strict UTF-8, comma-separated CSV parsing without header mangling."""

import csv
import io
import os
import re
from pathlib import PurePosixPath

import pandas as pd

MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
MAX_COLUMNS = int(os.getenv("MAX_COLUMNS", "500"))
MAX_ROWS = int(os.getenv("MAX_ROWS", "1000000"))
MAX_CELLS = int(os.getenv("MAX_CELLS", "5000000"))


class DataError(Exception):
    def __init__(self, code: str, message: str, status: int = 422):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


def safe_name(name: str) -> str:
    return re.sub(r"[^\w. -]", "_", PurePosixPath(name.replace("\\", "/")).name)[:120]


def parse_csv(data: bytes, filename: str) -> pd.DataFrame:
    if not filename.lower().endswith(".csv"):
        raise DataError("INVALID_EXTENSION", "Choose a file with a .csv extension.")
    if len(data) > MAX_BYTES:
        raise DataError("FILE_TOO_LARGE", "CSV exceeds the configured upload size limit.", 413)
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise DataError(
            "INVALID_ENCODING", "Save the CSV using UTF-8 encoding and try again."
        ) from exc
    if not text.strip():
        raise DataError("EMPTY_FILE", "The file is empty. Include a header and data rows.")
    if "\x00" in text:
        raise DataError("INVALID_CSV", "The file contains binary or null bytes.")
    try:
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        headers = next(reader)
        headers = [h.strip() for h in headers]
        if not headers or any(not h for h in headers):
            raise DataError("MISSING_HEADERS", "Every column needs a nonempty header.")
        if len(set(headers)) != len(headers):
            raise DataError(
                "DUPLICATE_HEADERS",
                "Duplicate column names detected. Give each column a unique name.",
            )
        if all(re.fullmatch(r"[+-]?\d+(\.\d+)?", h) for h in headers):
            raise DataError(
                "MISSING_HEADERS", "The first row appears numeric. Add descriptive column headers."
            )
        if len(headers) == 1 and any(d in headers[0] for d in [";", "\t", "|"]):
            raise DataError(
                "INVALID_DELIMITER", "Use comma-separated CSV, not semicolons, tabs or pipes."
            )
        if len(headers) > MAX_COLUMNS:
            raise DataError("TOO_WIDE", f"At most {MAX_COLUMNS} columns are supported.")
        rows = 0
        for row in reader:
            rows += 1
            if len(row) != len(headers):
                raise DataError(
                    "MALFORMED_CSV",
                    f"Record {rows + 1} has {len(row)} fields; expected {len(headers)}.",
                )
            if rows > MAX_ROWS or rows * len(headers) > MAX_CELLS:
                raise DataError(
                    "ANALYSIS_LIMIT", f"Use at most {MAX_ROWS:,} rows and {MAX_CELLS:,} cells.", 413
                )
        if not rows:
            raise DataError("NO_ROWS", "The CSV has headers but no data rows.")
    except csv.Error as exc:
        raise DataError(
            "MALFORMED_CSV", "The CSV has invalid quoting or malformed records."
        ) from exc
    # Keep original lexical values for explicit invalid/mixed type checks.
    return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False, names=headers, header=0)
