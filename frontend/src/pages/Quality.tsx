import { useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Issues, Severity } from "../components/Issues";
import type { Analysis } from "../lib/types";
import { fmt } from "../lib/types";
export default function Quality({
  report,
  query,
}: {
  report: Analysis;
  query: string;
}) {
  const [selected, setSelected] = useState("");
  const columns = report.columns.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const col = columns.find((c) => c.name === selected) || columns[0];
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>AnalySet Quality Score</h2>
          <span>{report.quality_score} / 100</span>
        </div>
        <div className="components">
          {Object.entries(report.components).map(([name, value]) => (
            <div key={name}>
              <div className="between">
                <span>{name}</span>
                <span>{fmt(value)}%</span>
              </div>
              <meter min={0} max={100} value={value} />
              <small>Weight {report.settings.weights[name]}%</small>
            </div>
          ))}
        </div>
        <p className="muted">
          Configurable quality heuristic. Outliers and name-based range findings
          do not automatically reduce validity.
        </p>
        <div className="severity-counts">
          {["High", "Medium", "Low"].map((s) => (
            <span key={s}>
              <Severity value={s} />{" "}
              {report.issues.filter((i) => i.severity === s).length}
            </span>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Column Profiles</h2>
          <span className="muted">{columns.length} columns</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Missing</th>
                <th>Missing %</th>
                <th>Unique</th>
                <th>Cardinality</th>
                <th>Mean</th>
                <th>Outliers</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.name}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelected(c.name)}
                    >
                      {c.name}
                    </button>
                  </td>
                  <td>{c.dtype}</td>
                  <td>{fmt(c.missing_count, 0)}</td>
                  <td>{fmt(c.missing_percentage)}%</td>
                  <td>{fmt(c.unique_values, 0)}</td>
                  <td>{fmt(c.cardinality * 100)}%</td>
                  <td>{fmt(c.mean)}</td>
                  <td>{c.outlier_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {col && (
        <section className="panel">
          <div className="panel-heading">
            <h2>{col.name} · Distribution</h2>
            <span>
              {col.constant
                ? "Constant"
                : col.near_constant
                  ? "Near constant"
                  : col.dtype}
            </span>
          </div>
          <div className="stat-list">
            {(["min", "max", "mean", "median", "std", "q1", "q3"] as const).map(
              (k) => (
                <div key={k}>
                  <small>{k.toUpperCase()}</small>
                  <p>{fmt(col[k], 3)}</p>
                </div>
              ),
            )}
          </div>
          <div className="chart">
            <ResponsiveContainer>
              <BarChart
                data={
                  col.dtype === "numeric" ? col.histogram : col.value_counts
                }
              >
                <XAxis
                  dataKey="value"
                  stroke="#888"
                  fontSize={10}
                  tickFormatter={(v) =>
                    typeof v === "number" ? fmt(v) : String(v).slice(0, 16)
                  }
                />
                <YAxis stroke="#888" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: "#181818",
                    border: "1px solid #292929",
                  }}
                />
                <Bar dataKey="count" fill="#638fcc" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <small>
            {col.dtype === "numeric"
              ? "Finite numeric observations, up to 12 equal-width bins."
              : "Top 20 nonmissing values."}
          </small>
        </section>
      )}
      {report.duplicate_detection && (
        <section className="panel">
          <h2>Exact duplicate records</h2>
          <p>
            {report.duplicate_count} excess records in{" "}
            {report.duplicate_detection.group_count} groups. Every group
            includes its first occurrence.
          </p>
          <p>
            Matched columns:{" "}
            {report.duplicate_detection.matched_columns.join(", ") || "None"}
          </p>
          <p>
            Excluded columns:{" "}
            {report.duplicate_detection.excluded_columns.join(", ") || "None"}
          </p>
          {report.duplicate_detection.note && (
            <p role="status">{report.duplicate_detection.note}</p>
          )}
          <details>
            <summary>Column decisions and overrides</summary>
            <p>
              Change individual column matching in Settings, save, then rerun
              your CSV.
            </p>
            <ul>
              {report.duplicate_detection.column_decisions.map((d) => (
                <li key={d.column}>
                  {d.column}: {d.excluded ? "excluded" : "included"} —{" "}
                  {d.reason}
                </li>
              ))}
            </ul>
          </details>
          <details>
            <summary>
              Inspect {report.duplicate_detection.group_count} duplicate groups
            </summary>
            <p>
              Row indices start at zero; CSV record numbers count the header as
              record 1.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Row indices</th>
                    <th>CSV records</th>
                    <th>Identifiers in row order</th>
                  </tr>
                </thead>
                <tbody>
                  {report.duplicate_detection.groups.map((g, i) => (
                    <tr key={i}>
                      <td>{g.row_indices.join(", ")}</td>
                      <td>{g.row_numbers.join(", ")}</td>
                      <td>
                        {g.identifiers
                          .map((ids) =>
                            Object.entries(ids)
                              .map(([k, v]) => `${k}: ${v ?? "missing"}`)
                              .join(", "),
                          )
                          .join("; ") || "No identifier columns"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
      <Issues issues={report.issues} query={query} />
    </>
  );
}
