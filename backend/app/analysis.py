"""Explainable profiling and quality heuristics; outliers are review candidates."""

from datetime import datetime, timezone
from uuid import uuid4

import numpy as np
import pandas as pd

from .duplicates import detect_duplicates
from .models import Analysis, Issue, Settings
from .parsing import DataError

MISSING = {"", "na", "n/a", "null", "none", "nan"}
SCHEMA_TYPES = {"All-null column", "Mixed datatype", "Invalid date", "Infinite values"}


def normalize(series: pd.Series) -> pd.Series:
    stripped = series.str.strip()
    return stripped.mask(stripped.str.lower().isin(MISSING))


def infer_type(series: pd.Series, name: str) -> str:
    values = series.dropna()
    if values.empty:
        return "empty"
    numeric = pd.to_numeric(values, errors="coerce")
    if numeric.notna().mean() >= 0.8:
        return "numeric"
    if any(word in name.lower() for word in ["date", "timestamp", "_at"]):
        return "datetime"
    if values.str.lower().isin(["true", "false"]).all():
        return "boolean"
    return "categorical"


def profile(frame: pd.DataFrame, filename: str, size: int, settings: Settings) -> Analysis:
    n, width = frame.shape
    issues: list[Issue] = []
    columns = []
    missing_total = 0
    invalid_total = 0
    inconsistent_total = 0

    def issue(name, kind, severity, mask, description, fix):
        count = int(mask.sum())
        if count:
            issues.append(
                Issue(
                    column=name,
                    issue_type=kind,
                    severity=severity,
                    affected_rows=count,
                    affected_percentage=round(count / n * 100, 3),
                    description=description,
                    suggested_fix=fix,
                    row_examples=[int(i) + 2 for i in frame.index[mask][:10]],
                )
            )

    for name in frame.columns:
        raw = frame[name]
        values = normalize(raw)
        missing = values.isna()
        count = int(missing.sum())
        missing_total += count
        dtype = infer_type(values, name)
        unique = int(values.nunique())
        freq = values.value_counts()
        col = {
            "name": name,
            "dtype": dtype,
            "missing_count": count,
            "missing_percentage": round(count / n * 100, 3),
            "unique_values": unique,
            "cardinality": round(unique / max(n - count, 1), 4),
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "std": None,
            "q1": None,
            "q3": None,
            "outlier_count": 0,
            "constant": unique == 1,
            "near_constant": False,
            "value_counts": [{"value": str(k), "count": int(v)} for k, v in freq.head(20).items()],
            "histogram": [],
        }
        issue(
            name,
            "All-null column" if count == n else "Missing values",
            "High" if count / n > 0.2 else "Medium",
            missing,
            f"{count} of {n} values are missing ({count / n:.1%}).",
            "Review source coverage; impute or remove only with domain justification.",
        )
        issue(
            name,
            "Empty strings",
            "Low",
            raw.str.strip().eq(""),
            "Blank or whitespace-only cells are counted as missing.",
            "Standardize missing-value representations.",
        )
        invalid = pd.Series(False, index=frame.index)
        if dtype == "numeric":
            numeric = pd.to_numeric(values, errors="coerce")
            bad = numeric.isna() & ~missing
            infinite = numeric.isin([np.inf, -np.inf])
            invalid |= bad | infinite
            issue(
                name,
                "Mixed datatype",
                "High",
                bad,
                "Non-numeric values occur in a predominantly numeric column.",
                "Correct source values or declare the field categorical.",
            )
            issue(
                name,
                "Infinite values",
                "High",
                infinite,
                "Positive or negative infinity is not a finite measurement.",
                "Review division by zero and source transformations.",
            )
            finite = numeric.where(np.isfinite(numeric)).dropna()
            if not finite.empty and finite.abs().max() > 1e150:
                raise DataError(
                    "NUMERIC_RANGE",
                    "Numeric magnitudes above 1e150 exceed safe analysis limits. Rescale the data before uploading.",
                )
            if not finite.empty:
                q1, q3 = finite.quantile([0.25, 0.75])
                lower = q1 - settings.iqr_multiplier * (q3 - q1)
                upper = q3 + settings.iqr_multiplier * (q3 - q1)
                outliers = (
                    numeric.notna() & np.isfinite(numeric) & ((numeric < lower) | (numeric > upper))
                )
                col.update(
                    min=float(finite.min()),
                    max=float(finite.max()),
                    mean=float(finite.mean()),
                    median=float(finite.median()),
                    std=float(finite.std()) if len(finite) > 1 else 0.0,
                    q1=float(q1),
                    q3=float(q3),
                    lower_bound=float(lower),
                    upper_bound=float(upper),
                    outlier_count=int(outliers.sum()),
                )
                bins, edges = np.histogram(finite, bins=min(12, max(1, finite.nunique())))
                col["histogram"] = [
                    {"value": float((edges[i] + edges[i + 1]) / 2), "count": int(v)}
                    for i, v in enumerate(bins)
                ]
                issue(
                    name,
                    "Statistical outlier",
                    "Medium",
                    outliers,
                    f"Values outside IQR bounds [{lower:.5g}, {upper:.5g}]. Outliers are not necessarily errors.",
                    "Review context before filtering or transforming these observations.",
                )
                if name.lower() in {"age", "revenue", "price", "quantity"}:
                    suspicious = numeric.lt(0) | (
                        numeric.gt(120) if name.lower() == "age" else False
                    )
                    issue(
                        name,
                        "Suspicious range",
                        "Medium",
                        suspicious,
                        "Values fall outside a name-based plausibility heuristic.",
                        "Confirm valid ranges with the dataset owner.",
                    )
        elif dtype == "datetime":
            dates = pd.to_datetime(values, errors="coerce", format="mixed", utc=True)
            invalid = dates.isna() & ~missing
            issue(
                name,
                "Invalid date",
                "High",
                invalid,
                "Date-like field contains unparseable values.",
                "Use an unambiguous ISO 8601 date format.",
            )
        elif dtype == "categorical":
            numeric_mask = pd.to_numeric(values, errors="coerce").notna() & ~missing
            if numeric_mask.any() and (~numeric_mask & ~missing).any():
                issue(
                    name,
                    "Mixed datatype",
                    "Medium",
                    ~missing,
                    "Numeric and text values coexist; this may be intentional.",
                    "Confirm whether this field should be numeric, categorical or an identifier.",
                )
                inconsistent_total += int((~missing).sum())
            lower_values = values.str.casefold()
            variants = values.groupby(lower_values).transform("nunique").gt(1).fillna(False)
            issue(
                name,
                "Inconsistent category",
                "Low",
                variants,
                "Categories differ only in letter case.",
                "Standardize case if these categories have the same meaning.",
            )
            inconsistent_total += int(variants.sum())
            if unique > 50 and col["cardinality"] > 0.9:
                issue(
                    name,
                    "High cardinality",
                    "Low",
                    ~missing,
                    "More than 90% of nonmissing values are unique.",
                    "Review whether this is an identifier before categorical encoding.",
                )
        invalid_total += int(invalid.sum())
        if unique == 1:
            issue(
                name,
                "Constant column",
                "Low",
                ~missing,
                "This column has one distinct nonmissing value.",
                "Keep if meaningful metadata; otherwise consider removing it from model features.",
            )
        elif not freq.empty and freq.iloc[0] / max(n - count, 1) >= 0.95:
            col["near_constant"] = True
            issue(
                name,
                "Near-constant column",
                "Low",
                values.eq(freq.index[0]),
                "At least 95% of nonmissing values share one value.",
                "Assess whether rare values carry useful information.",
            )
        if name.lower() == "id" or name.lower().endswith("_id"):
            issue(
                name,
                "Duplicate identifier",
                "High",
                values.duplicated(keep=False) & ~missing,
                "Repeated values in a name-inferred identifier column.",
                "Verify the intended entity key before deduplicating.",
            )
        columns.append(col)
    duplicates, duplicate_details = detect_duplicates(frame, settings)
    dup_count = int(duplicates.sum())
    issue(
        "(dataset)",
        "Duplicate row",
        "Medium",
        duplicates,
        "Exact repeated records after the first occurrence; matched columns: "
        + ", ".join(duplicate_details["matched_columns"])
        + "; excluded columns: "
        + (", ".join(duplicate_details["excluded_columns"]) or "None")
        + ".",
        "Confirm repeated observations are unintended before removing them.",
    )
    schema_count = sum(i.issue_type in SCHEMA_TYPES for i in issues)
    schema_columns = len({i.column for i in issues if i.issue_type in SCHEMA_TYPES})
    components = {
        "Completeness": 100 * (1 - missing_total / (n * width)),
        "Uniqueness": 100 * (1 - dup_count / n),
        "Validity": 100 * (1 - invalid_total / (n * width)),
        "Consistency": 100 * (1 - min(inconsistent_total / (n * width), 1)),
        "Schema Health": 100 * (1 - schema_columns / width),
    }
    components = {k: round(max(0, min(100, v)), 3) for k, v in components.items()}
    score = round(sum(components[k] * settings.weights[k] / 100 for k in components), 2)
    issues.sort(key=lambda i: ({"High": 0, "Medium": 1, "Low": 2}[i.severity], -i.affected_rows))
    summary = [
        f"{n:,} rows and {width} columns analyzed.",
        f"{missing_total:,} missing cells ({missing_total / (n * width):.1%}); {dup_count:,} duplicate rows.",
        f"AnalySet Quality Score: {score}/100. This is a configurable quality heuristic.",
    ]
    summary.append(
        "Duplicate comparison excludes: "
        + (", ".join(duplicate_details["excluded_columns"]) or "None")
        + ". Review matching rules in Data Quality."
    )
    summary += [f"{i.column}: {i.description}" for i in issues[:5]]
    return Analysis(
        id=uuid4().hex,
        timestamp=datetime.now(timezone.utc).isoformat(),
        filename=filename,
        file_size=size,
        memory_usage=int(frame.memory_usage(deep=True).sum()),
        row_count=n,
        column_count=width,
        missing_count=missing_total,
        missing_percentage=round(missing_total / (n * width) * 100, 3),
        duplicate_count=dup_count,
        duplicate_detection=duplicate_details,
        duplicate_percentage=round(dup_count / n * 100, 3),
        schema_issues=schema_count,
        quality_score=score,
        components=components,
        columns=columns,
        issues=issues,
        summary=summary,
        settings=settings,
    )
