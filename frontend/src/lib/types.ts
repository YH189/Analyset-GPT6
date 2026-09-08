export type Settings = {
  iqr_multiplier: number;
  drift_sensitivity: "sensitive" | "standard" | "relaxed";
  weights: Record<string, number>;
};
export const defaults: Settings = {
  iqr_multiplier: 1.5,
  drift_sensitivity: "standard",
  weights: {
    Completeness: 30,
    Uniqueness: 20,
    Validity: 20,
    Consistency: 15,
    "Schema Health": 15,
  },
};
export type Issue = {
  column: string;
  issue_type: string;
  severity: "High" | "Medium" | "Low";
  affected_rows: number;
  affected_percentage: number;
  description: string;
  suggested_fix: string;
  row_examples: number[];
};
export type Column = {
  name: string;
  dtype: string;
  missing_count: number;
  missing_percentage: number;
  unique_values: number;
  cardinality: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  q1: number | null;
  q3: number | null;
  outlier_count: number;
  constant: boolean;
  near_constant: boolean;
  value_counts: { value: string; count: number }[];
  histogram: { value: number; count: number }[];
};
export type Analysis = {
  id: string;
  timestamp: string;
  filename: string;
  file_size: number;
  memory_usage: number;
  row_count: number;
  column_count: number;
  missing_count: number;
  missing_percentage: number;
  duplicate_count: number;
  duplicate_percentage: number;
  schema_issues: number;
  quality_score: number;
  components: Record<string, number>;
  columns: Column[];
  issues: Issue[];
  summary: string[];
  settings: Settings;
};
export type DriftColumn = {
  column: string;
  dtype: string;
  baseline_n: number;
  current_n: number;
  statistic: number | null;
  p_value: number | null;
  psi: number | null;
  threshold: number;
  method: string;
  status: string;
  interpretation: string;
  unexpected_categories: string[];
  distribution: { label: string; baseline: number; current: number }[];
};
export type Comparison = {
  baseline_id: string;
  current_id: string;
  overall: "Low" | "Moderate" | "High";
  analyzed: number;
  drifted: number;
  added_columns: string[];
  removed_columns: string[];
  type_changes: { column: string; baseline: string; current: string }[];
  metrics: { name: string; baseline: number; current: number; delta: number }[];
  columns: DriftColumn[];
  profile_changes: {
    column: string;
    baseline_missing: number;
    current_missing: number;
    baseline_cardinality: number;
    current_cardinality: number;
    baseline_outliers: number;
    current_outliers: number;
  }[];
  quality_issues: { baseline: number; current: number };
};
export const fmt = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
