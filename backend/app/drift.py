"""Distribution comparison with effect-size thresholds and sample-size guards."""

import numpy as np
import pandas as pd
from scipy.spatial.distance import jensenshannon
from scipy.stats import ks_2samp

from .analysis import normalize
from .models import Analysis, Comparison


def compare(
    base: Analysis, current: Analysis, a: pd.DataFrame, b: pd.DataFrame, sensitivity: str
) -> Comparison:
    factor = {"sensitive": 0.7, "standard": 1.0, "relaxed": 1.3}[sensitivity]
    ac = {c["name"]: c for c in base.columns}
    bc = {c["name"]: c for c in current.columns}
    details, changes, profiles = [], [], []
    for name in sorted(ac.keys() & bc.keys()):
        profiles.append(
            {
                "column": name,
                "baseline_missing": ac[name]["missing_percentage"],
                "current_missing": bc[name]["missing_percentage"],
                "baseline_cardinality": ac[name]["cardinality"],
                "current_cardinality": bc[name]["cardinality"],
                "baseline_outliers": ac[name]["outlier_count"],
                "current_outliers": bc[name]["outlier_count"],
            }
        )
        if ac[name]["dtype"] != bc[name]["dtype"]:
            changes.append(
                {"column": name, "baseline": ac[name]["dtype"], "current": bc[name]["dtype"]}
            )
            continue
        kind = ac[name]["dtype"]
        if kind not in {"numeric", "categorical", "boolean"}:
            continue
        x, y = normalize(a[name]).dropna(), normalize(b[name]).dropna()
        if kind == "numeric":
            x = pd.to_numeric(x, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
            y = pd.to_numeric(y, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
        entry = {
            "column": name,
            "dtype": kind,
            "baseline_n": len(x),
            "current_n": len(y),
            "statistic": None,
            "p_value": None,
            "psi": None,
            "threshold": 0.2 * factor,
            "method": "KS D" if kind == "numeric" else "JS divergence (base 2)",
            "status": "Insufficient data",
            "unexpected_categories": [],
            "distribution": [],
        }
        if min(len(x), len(y)) < 20:
            entry["interpretation"] = (
                "At least 20 nonmissing finite observations per dataset are required."
            )
            details.append(entry)
            continue
        if kind == "numeric":
            # Deterministically cap statistical samples for bounded comparison cost.
            x = x.sample(min(len(x), 10000), random_state=42).to_numpy(dtype=float)
            y = y.sample(min(len(y), 10000), random_state=42).to_numpy(dtype=float)
            test = ks_2samp(x, y, method="asymp")
            stat = float(test.statistic)
            entry["p_value"] = float(test.pvalue)
            interior = np.unique(np.quantile(x, np.linspace(0, 1, 11)))
            edges = np.concatenate(([-np.inf], interior, [np.inf]))
            p = np.histogram(x, edges)[0].astype(float)
            q = np.histogram(y, edges)[0].astype(float)
            p = (p + 0.5) / (p.sum() + 0.5 * len(p))
            q = (q + 0.5) / (q.sum() + 0.5 * len(q))
            entry["psi"] = float(np.sum((q - p) * np.log(q / p)))
            entry["distribution"] = [
                {"label": f"Bin {i + 1}", "baseline": float(p[i]), "current": float(q[i])}
                for i in range(len(p))
            ]
            entry["interpretation"] = (
                "KS D measures distribution separation; status uses effect size, not a significance claim. PSI is descriptive."
            )
        else:
            px, qx = x.value_counts(normalize=True), y.value_counts(normalize=True)
            categories = px.index.union(qx.index)
            p, q = px.reindex(categories, fill_value=0), qx.reindex(categories, fill_value=0)
            stat = float(jensenshannon(p, q, base=2) ** 2)
            entry["threshold"] = 0.1 * factor
            entry["unexpected_categories"] = sorted(set(y) - set(x))[:50]
            top = (p + q).nlargest(15).index
            entry["distribution"] = [
                {"label": str(k), "baseline": float(p[k]), "current": float(q[k])} for k in top
            ]
            entry["interpretation"] = (
                "Jensen-Shannon divergence compares category frequencies (0 identical, 1 disjoint). Top 15 categories shown."
            )
        entry["statistic"] = stat
        threshold = entry["threshold"]
        entry["status"] = (
            "High" if stat >= threshold * 2 else "Moderate" if stat >= threshold else "Low"
        )
        details.append(entry)
    analyzed = [d for d in details if d["statistic"] is not None]
    ranks = {"Low": 0, "Moderate": 1, "High": 2}
    overall = max((d["status"] for d in analyzed), key=lambda s: ranks[s], default="Low")
    return Comparison(
        baseline_id=base.id,
        current_id=current.id,
        overall=overall,
        analyzed=len(analyzed),
        drifted=sum(d["status"] != "Low" for d in analyzed),
        added_columns=sorted(bc.keys() - ac.keys()),
        removed_columns=sorted(ac.keys() - bc.keys()),
        type_changes=changes,
        columns=details,
        profile_changes=profiles,
        quality_issues={"baseline": len(base.issues), "current": len(current.issues)},
        metrics=[
            {
                "name": name,
                "baseline": getattr(base, key),
                "current": getattr(current, key),
                "delta": round(getattr(current, key) - getattr(base, key), 3),
            }
            for name, key in [
                ("Rows", "row_count"),
                ("Columns", "column_count"),
                ("Missing %", "missing_percentage"),
                ("Duplicate %", "duplicate_percentage"),
                ("Quality score", "quality_score"),
            ]
        ],
    )
