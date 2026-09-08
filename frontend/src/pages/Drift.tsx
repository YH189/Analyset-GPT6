import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Upload } from "../components/Upload";
import { Severity } from "../components/Issues";
import type { Analysis, Comparison, Settings } from "../lib/types";
import { fmt } from "../lib/types";
import * as api from "../lib/api";
export default function Drift({
  settings,
  reports,
  result,
  onResult,
  onReport,
}: {
  settings: Settings;
  reports: Analysis[];
  result: Comparison | null;
  onResult: (r: Comparison) => void;
  onReport: (r: Analysis) => void;
}) {
  const [baseline, setBaseline] = useState("");
  const [current, setCurrent] = useState("");
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  async function run(samples = false) {
    setBusy(true);
    setError("");
    try {
      let a = baseline,
        b = current;
      if (samples) {
        const ar = await api.sample("baseline");
        onReport(ar);
        a = ar.id;
        const br = await api.sample("drifted");
        onReport(br);
        b = br.id;
      } else {
        if (baseFile) {
          const r = await api.analyze(baseFile, settings);
          onReport(r);
          a = r.id;
        }
        if (currentFile) {
          const r = await api.analyze(currentFile, settings);
          onReport(r);
          b = r.id;
        }
      }
      if (!a || !b) throw new Error("Choose a baseline and current dataset.");
      const r = await api.compare(a, b, settings.drift_sensitivity);
      setBaseline(a);
      setCurrent(b);
      setBaseFile(null);
      setCurrentFile(null);
      onResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const detail =
    result?.columns.find((c) => c.column === selected) || result?.columns[0];
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Baseline / Current Comparison</h2>
          <span className="muted">
            Sensitivity: {settings.drift_sensitivity}
          </span>
        </div>
        <div className="two-col">
          <div>
            <Upload
              label="Baseline Dataset"
              file={baseFile}
              onFile={setBaseFile}
              disabled={busy}
            />
            <label className="field">
              Or select an analyzed dataset
              <select
                value={baseline}
                onChange={(e) => {
                  setBaseline(e.target.value);
                  setBaseFile(null);
                }}
                disabled={busy}
              >
                <option value="">Choose baseline</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.filename} · {new Date(r.timestamp).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <Upload
              label="Current Dataset"
              file={currentFile}
              onFile={setCurrentFile}
              disabled={busy}
            />
            <label className="field">
              Or select an analyzed dataset
              <select
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  setCurrentFile(null);
                }}
                disabled={busy}
              >
                <option value="">Choose current</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.filename} · {new Date(r.timestamp).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="actions">
          <button
            disabled={
              busy || (!baseFile && !baseline) || (!currentFile && !current)
            }
            onClick={() => void run()}
          >
            Compare datasets
          </button>
          <button disabled={busy} onClick={() => void run(true)}>
            Compare sample datasets
          </button>
        </div>
        {busy && (
          <p role="status">Analyzing datasets and comparing distributions…</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {result && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>Drift Results</h2>
              <Severity value={result.overall} />
            </div>
            <p>
              {result.drifted} of {result.analyzed} analyzed columns show
              measurable drift.
            </p>
            {!result.analyzed && (
              <p className="error">
                Insufficient observations: Low does not establish distribution
                stability.
              </p>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Baseline</th>
                    <th>Current</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.metrics.map((m) => (
                    <tr key={m.name}>
                      <td>{m.name}</td>
                      <td>{fmt(m.baseline)}</td>
                      <td>{fmt(m.current)}</td>
                      <td>
                        {m.delta > 0 ? "+" : ""}
                        {fmt(m.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Added: {result.added_columns.join(", ") || "None"} · Removed:{" "}
              {result.removed_columns.join(", ") || "None"}
            </p>
            <p className="muted">
              Type changes:{" "}
              {result.type_changes
                .map((c) => `${c.column}: ${c.baseline} → ${c.current}`)
                .join("; ") || "None"}
            </p>
            <p className="muted">
              Quality findings: {result.quality_issues.baseline} baseline →{" "}
              {result.quality_issues.current} current
            </p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Column Drift</h2>
              <span className="muted">Select a column for details</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Method</th>
                    <th>Statistic</th>
                    <th>Threshold</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.columns.map((c) => (
                    <tr key={c.column}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelected(c.column)}
                        >
                          {c.column}
                        </button>
                      </td>
                      <td>{c.method}</td>
                      <td>{fmt(c.statistic, 4)}</td>
                      <td>{fmt(c.threshold, 3)}</td>
                      <td>
                        <Severity value={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {detail && (
            <section className="panel">
              <h2>{detail.column} · Distribution comparison</h2>
              <p className="muted">{detail.interpretation}</p>
              <p className="muted">
                Observations: {detail.baseline_n} / {detail.current_n}. PSI:{" "}
                {fmt(detail.psi, 4)}. KS p-value (unadjusted):{" "}
                {fmt(detail.p_value, 6)}.
              </p>
              {detail.distribution.length > 0 && (
                <>
                  <div className="chart">
                    <ResponsiveContainer>
                      <LineChart data={detail.distribution}>
                        <XAxis dataKey="label" fontSize={10} stroke="#888" />
                        <YAxis fontSize={10} stroke="#888" />
                        <Tooltip
                          contentStyle={{
                            background: "#181818",
                            border: "1px solid #292929",
                          }}
                        />
                        <Line
                          dataKey="baseline"
                          stroke="#6999e5"
                          strokeWidth={1}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          dataKey="current"
                          stroke="#b29acc"
                          strokeWidth={1}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <small>
                    Blue: baseline · Purple: current · relative frequencies
                  </small>
                </>
              )}
              <p>
                Unexpected categories:{" "}
                {detail.unexpected_categories.join(", ") || "None"}
              </p>
            </section>
          )}
          <section className="panel">
            <h2>Profile changes</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Missing % (B → C)</th>
                    <th>Cardinality % (B → C)</th>
                    <th>Outliers (B → C)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.profile_changes.map((c) => (
                    <tr key={c.column}>
                      <td>{c.column}</td>
                      <td>
                        {fmt(c.baseline_missing)} → {fmt(c.current_missing)}
                      </td>
                      <td>
                        {fmt(c.baseline_cardinality * 100)} →{" "}
                        {fmt(c.current_cardinality * 100)}
                      </td>
                      <td>
                        {c.baseline_outliers} → {c.current_outliers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
