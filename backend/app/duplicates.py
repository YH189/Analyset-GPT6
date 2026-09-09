"""Exact business-record duplicates with explicit, conservative identifier inference."""

import re

import pandas as pd

from .models import Settings
from .parsing import DataError

# Token boundaries avoid treating e.g. "paid" or "country" as identifier names.
IDENTIFIER = re.compile(r"(?:^|_)(?:id|uuid|guid|key|pk|index|row_number|row_num|rownum)(?:$)")


def detect_duplicates(frame: pd.DataFrame, settings: Settings) -> tuple[pd.Series, dict]:
    """Count excess records (group size - 1), preserving exact lexical equality.

    Exclude only name-inferred, complete, unique identifiers automatically.
    Uniqueness or monotonicity alone is insufficient: measurements can be unique.
    Row indices are zero-based positions; CSV record numbers include the header.
    Empty comparison keys are not evidence that all rows duplicate each other.
    """
    overrides = settings.duplicate_column_overrides
    unknown = set(overrides) - set(frame.columns)
    if unknown:
        raise DataError(
            "INVALID_SETTINGS", "Unknown duplicate override columns: " + ", ".join(sorted(unknown))
        )
    decisions = []
    identifiers = []
    excluded = []
    for column in frame.columns:
        name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", column)
        name = re.sub(r"[\s-]+", "_", name).lower()
        named_id = bool(IDENTIFIER.search(name))
        if named_id:
            identifiers.append(column)
        values = frame[column]
        complete = (
            values.notna().all()
            and not values.astype(str)
            .str.strip()
            .str.lower()
            .isin(["", "na", "n/a", "null", "none", "nan"])
            .any()
        )
        unique = len(frame) > 1 and complete and values.nunique(dropna=False) == len(frame)
        automatic = settings.duplicate_auto_exclude_ids and named_id and unique
        override = overrides.get(column, "auto")
        exclude = override == "exclude" or (override == "auto" and automatic)
        reason = (
            "Explicit user override"
            if override != "auto"
            else "Identifier-like name and 100% unique, nonmissing values"
            if automatic
            else "Automatic exclusion disabled"
            if not settings.duplicate_auto_exclude_ids
            else "No complete, unique identifier evidence"
        )
        decisions.append(
            {"column": column, "excluded": bool(exclude), "reason": reason, "override": override}
        )
        if exclude:
            excluded.append(column)
    matched = [c for c in frame.columns if c not in excluded]
    mask = pd.Series(False, index=frame.index)
    result = {
        "mode": "exact",
        "matched_columns": matched,
        "excluded_columns": excluded,
        "column_decisions": decisions,
        "groups": [],
        "group_count": 0,
        "evaluated": bool(matched),
        "note": "",
        "duplicate_count": 0,
    }
    if not matched:
        result["note"] = (
            "No comparison columns remain. Include at least one column to detect duplicates."
        )
        return mask, result
    mask = frame.duplicated(subset=matched, keep="first")
    repeated = frame.duplicated(subset=matched, keep=False)
    subset = frame.loc[repeated, matched].reset_index(drop=True)
    positions = [i for i, value in enumerate(repeated) if value]
    if positions:
        for offsets in subset.groupby(matched, dropna=False, sort=False, observed=True).indices.values():
            rows = [positions[int(i)] for i in offsets]
            result["groups"].append(
                {
                    "group_id": len(result["groups"]) + 1,
                    "size": len(rows),
                    "row_indices": rows,
                    "row_numbers": [i + 2 for i in rows],
                    "identifiers": [
                        {
                            c: None if pd.isna(frame.iloc[i][c]) else str(frame.iloc[i][c])
                            for c in identifiers
                        }
                        for i in rows
                    ],
                    "matched_columns": matched,
                    "excluded_columns": excluded,
                }
            )
    result["group_count"] = len(result["groups"])
    result["duplicate_count"] = int(mask.sum())
    return mask, result
