import type { Analysis, Comparison } from "../lib/types";
export default function Reports({
  reports,
  comparisons,
  onOpen,
}: {
  reports: Analysis[];
  comparisons: Record<string, Comparison>;
  onOpen: (r: Analysis) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Session Reports</h2>
        <span>{reports.length} analyses</span>
      </div>
      <p className="muted">
        Reports are available during this active workspace session. Export to
        keep a permanent copy.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Analyzed</th>
              <th>Quality</th>
              <th>Issues</th>
              <th>Drift</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {[...reports].reverse().map((r) => (
              <tr key={r.id}>
                <td>{r.filename}</td>
                <td>{new Date(r.timestamp).toLocaleString()}</td>
                <td>{r.quality_score}</td>
                <td>{r.issues.length}</td>
                <td>{comparisons[r.id]?.overall || "Not compared"}</td>
                <td>
                  <button onClick={() => onOpen(r)}>Open report</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!reports.length && (
        <p className="empty-inline">
          No reports yet. Analyze a dataset to begin.
        </p>
      )}
    </section>
  );
}
