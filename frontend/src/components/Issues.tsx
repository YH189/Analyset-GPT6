import { useState } from "react";
import type { Issue } from "../lib/types";
import { fmt } from "../lib/types";
export function Severity({ value }: { value: string }) {
  return (
    <span className="severity">
      <span className={`dot ${value.toLowerCase()}`} />
      {value}
    </span>
  );
}
export function Issues({
  issues,
  query = "",
}: {
  issues: Issue[];
  query?: string;
}) {
  const [limit, setLimit] = useState(20);
  const filtered = issues.filter((i) =>
    `${i.column} ${i.issue_type} ${i.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Detected Issues</h2>
        <span className="muted">{filtered.length} findings</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Issue Type</th>
              <th>Severity</th>
              <th>Rows Affected</th>
              <th>Suggested Fix</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((i, index) => (
              <tr key={`${i.column}-${i.issue_type}-${index}`}>
                <td>{i.column}</td>
                <td>
                  <details>
                    <summary>{i.issue_type}</summary>
                    <p>{i.description}</p>
                    <small>
                      CSV record numbers (header = 1):{" "}
                      {i.row_examples.join(", ")}
                    </small>
                  </details>
                </td>
                <td>
                  <Severity value={i.severity} />
                </td>
                <td>
                  {fmt(i.affected_rows, 0)}{" "}
                  <small>({fmt(i.affected_percentage)}%)</small>
                </td>
                <td>{i.suggested_fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="empty-inline">No matching issues detected.</p>
      )}
      {filtered.length > limit && (
        <button onClick={() => setLimit(limit + 50)}>Show more findings</button>
      )}
    </section>
  );
}
