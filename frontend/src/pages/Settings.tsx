import { useState } from "react";
import { defaults, type Settings as Config } from "../lib/types";
export default function Settings({
  settings,
  columns = [],
  onSave,
}: {
  settings: Config;
  columns?: string[];
  onSave: (s: Config) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const total = Object.values(draft.weights).reduce((a, b) => a + b, 0);
  const valid =
    Number.isFinite(draft.iqr_multiplier) &&
    draft.iqr_multiplier >= 0.5 &&
    draft.iqr_multiplier <= 5 &&
    Math.abs(total - 100) < 0.001 &&
    Object.values(draft.weights).every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 100,
    );
  return (
    <section className="panel settings">
      <h2>Analysis Settings</h2>
      <p className="muted">
        Applies to future analyses. Existing reports retain their original
        settings. Samples use default quality settings.
      </p>
      <label className="field">
        Outlier method
        <input value="Interquartile range (IQR)" readOnly />
      </label>
      <label className="field">
        IQR multiplier
        <input
          type="number"
          min="0.5"
          max="5"
          step="0.1"
          value={draft.iqr_multiplier}
          onChange={(e) =>
            setDraft({ ...draft, iqr_multiplier: e.target.valueAsNumber })
          }
        />
      </label>
      <label className="field">
        Drift sensitivity
        <select
          value={draft.drift_sensitivity}
          onChange={(e) =>
            setDraft({
              ...draft,
              drift_sensitivity: e.target.value as Config["drift_sensitivity"],
            })
          }
        >
          <option value="sensitive">Sensitive</option>
          <option value="standard">Standard</option>
          <option value="relaxed">Relaxed</option>
        </select>
      </label>
      <h3>Duplicate comparison</h3>
      <label className="field">
        <span>Automatically exclude unique identifier columns</span>
        <input
          type="checkbox"
          checked={draft.duplicate_auto_exclude_ids}
          onChange={(e) =>
            setDraft({ ...draft, duplicate_auto_exclude_ids: e.target.checked })
          }
        />
      </label>
      <p className="muted">
        Exact equality on included columns. Unique values alone do not imply an
        identifier. Turn off automatic exclusion for full-row matching. Save and
        rerun your uploaded CSV to apply changes.
      </p>
      {Array.from(
        new Set([...columns, ...Object.keys(draft.duplicate_column_overrides)]),
      ).map((column) => (
        <label className="field" key={column}>
          {column} · duplicate matching
          <select
            value={draft.duplicate_column_overrides[column] || "auto"}
            onChange={(e) => {
              const overrides = { ...draft.duplicate_column_overrides };
              if (e.target.value === "auto") delete overrides[column];
              else overrides[column] = e.target.value as "include" | "exclude";
              setDraft({ ...draft, duplicate_column_overrides: overrides });
            }}
          >
            <option value="auto">Automatic</option>
            <option value="include">Force include</option>
            <option value="exclude">Force exclude</option>
          </select>
        </label>
      ))}
      {!columns.length && (
        <p className="muted">
          Analyze a dataset to configure individual column overrides.
        </p>
      )}
      <h3>Quality score weights</h3>
      {Object.entries(draft.weights).map(([key, value]) => (
        <label className="field" key={key}>
          {key} (%)
          <input
            type="number"
            min="0"
            max="100"
            value={value}
            onChange={(e) =>
              setDraft({
                ...draft,
                weights: { ...draft.weights, [key]: e.target.valueAsNumber },
              })
            }
          />
        </label>
      ))}
      <p className={valid ? "muted" : "error"}>
        Total: {total}% · must equal 100%
      </p>
      <div className="actions">
        <button
          disabled={!valid}
          onClick={() => {
            onSave(draft);
            setMessage("Settings saved for future analyses.");
          }}
        >
          Save settings
        </button>
        <button
          onClick={() => {
            setDraft(defaults);
            setMessage("Defaults restored. Save to apply.");
          }}
        >
          Restore defaults
        </button>
      </div>
      <p role="status">{message}</p>
      <hr />
      <h3>Session and analysis limits</h3>
      <p className="muted">
        100 MB per file; default limits of 500 columns, 1 million rows and 5
        million cells. Server reports expire after one hour and may be evicted
        earlier under memory pressure. No cloud storage or accounts.
      </p>
    </section>
  );
}
