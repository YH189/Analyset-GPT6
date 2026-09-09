"""Validated settings and public API contracts."""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class Settings(BaseModel):
    duplicate_auto_exclude_ids: bool = True
    duplicate_column_overrides: dict[str, Literal["auto", "include", "exclude"]] = Field(
        default_factory=dict
    )
    iqr_multiplier: float = Field(default=1.5, ge=0.5, le=5)
    drift_sensitivity: Literal["sensitive", "standard", "relaxed"] = "standard"
    weights: dict[str, float] = Field(
        default_factory=lambda: {
            "Completeness": 30,
            "Uniqueness": 20,
            "Validity": 20,
            "Consistency": 15,
            "Schema Health": 15,
        }
    )

    @model_validator(mode="after")
    def validate_weights(self):
        names = {"Completeness", "Uniqueness", "Validity", "Consistency", "Schema Health"}
        if set(self.weights) != names or any(v < 0 or v > 100 for v in self.weights.values()):
            raise ValueError("Provide all five nonnegative quality weights between 0 and 100.")
        if abs(sum(self.weights.values()) - 100) > 0.001:
            raise ValueError("Quality weights must sum to 100.")
        return self


class Issue(BaseModel):
    column: str
    issue_type: str
    severity: Literal["High", "Medium", "Low"]
    affected_rows: int
    affected_percentage: float
    description: str
    suggested_fix: str
    row_examples: list[int] = []


class Analysis(BaseModel):
    id: str
    timestamp: str
    filename: str
    file_size: int
    memory_usage: int
    row_count: int
    column_count: int
    missing_count: int
    missing_percentage: float
    duplicate_count: int
    duplicate_percentage: float
    duplicate_detection: dict[str, Any] = Field(default_factory=dict)
    schema_issues: int
    quality_score: float
    components: dict[str, float]
    columns: list[dict[str, Any]]
    issues: list[Issue]
    summary: list[str]
    settings: Settings


class CompareRequest(BaseModel):
    baseline_id: str
    current_id: str
    sensitivity: Literal["sensitive", "standard", "relaxed"] = "standard"


class Comparison(BaseModel):
    baseline_id: str
    current_id: str
    overall: Literal["Low", "Moderate", "High"]
    analyzed: int
    drifted: int
    added_columns: list[str]
    removed_columns: list[str]
    type_changes: list[dict[str, str]]
    metrics: list[dict[str, Any]]
    columns: list[dict[str, Any]]
    profile_changes: list[dict[str, Any]]
    quality_issues: dict[str, int]
