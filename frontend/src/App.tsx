import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Upload as UploadIcon,
  ShieldCheck,
  GitCompareArrows,
  Files,
  Settings as SettingsIcon,
  Search,
  Menu,
  X,
  Play,
  Download,
  Copy,
  CircleAlert,
  Database,
  PanelLeftClose,
} from "lucide-react";
import { Upload } from "./components/Upload";
import { Issues, Severity } from "./components/Issues";
import { MissingChart, Trends } from "./components/Charts";
import {
  defaults,
  fmt,
  type Analysis,
  type Comparison,
  type Settings,
} from "./lib/types";
import * as api from "./lib/api";
const Quality = lazy(() => import("./pages/Quality"));
const Drift = lazy(() => import("./pages/Drift"));
const Reports = lazy(() => import("./pages/Reports"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const navigation = [
  ["Overview", LayoutDashboard],
  ["Upload", UploadIcon],
  ["Data Quality", ShieldCheck],
  ["Drift", GitCompareArrows],
  ["Reports", Files],
  ["Settings", SettingsIcon],
] as const;
type Page = (typeof navigation)[number][0];
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("analyset-settings") || "null");
    if (
      s &&
      Number.isFinite(s.iqr_multiplier) &&
      s.iqr_multiplier >= 0.5 &&
      s.iqr_multiplier <= 5 &&
      ["sensitive", "standard", "relaxed"].includes(s.drift_sensitivity) &&
      Object.keys(defaults.weights).every(
        (k) => typeof s.weights?.[k] === "number" && s.weights[k] >= 0,
      ) &&
      Object.keys(s.weights).length === 5 &&
      Math.abs(
        Object.values(s.weights as Record<string, number>).reduce(
          (a, b) => a + b,
          0,
        ) - 100,
      ) < 0.001
    )
      return s;
  } catch {
    /* Invalid preferences fall back to defaults. */
  }
  return defaults;
}
export default function App() {
  const [page, setPage] = useState<Page>("Overview");
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Analysis | null>(null);
  const [reports, setReports] = useState<Analysis[]>([]);
  const [comparisons, setComparisons] = useState<Record<string, Comparison>>(
    {},
  );
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("pdf");
  const search = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === "Escape") {
        setDrawer(false);
        menu.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function go(p: Page) {
    setPage(p);
    setDrawer(false);
    setError("");
  }
  function add(r: Analysis) {
    setReports((prev) => [...prev.filter((x) => x.id !== r.id), r].slice(-20));
    setReport(r);
  }
  async function run(useSample = false) {
    setBusy(true);
    setError("");
    setStatus(
      useSample
        ? "Loading and analyzing sample dataset…"
        : "Uploading CSV; validating, profiling and running quality checks…",
    );
    try {
      if (!file && !useSample) throw new Error("Select a CSV file first.");
      add(useSample ? await api.sample() : await api.analyze(file!, settings));
      setStatus("Analysis complete.");
      setPage("Overview");
    } catch (e) {
      setError((e as Error).message);
      setStatus("Analysis failed.");
    } finally {
      setBusy(false);
    }
  }
  async function exportCurrent() {
    if (!report) return;
    setBusy(true);
    setError("");
    try {
      await api.exportReport(report.id, format);
      setStatus(`${format.toUpperCase()} report exported.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const matches = query.trim()
    ? reports.filter((r) =>
        `${r.filename} ${r.row_count} ${r.column_count}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : [];
  const drift = report ? comparisons[report.id] : null;
  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      {drawer && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go("Overview");
          }}
        >
          <img src="/favicon.svg" alt="" />
          <span>AnalySet</span>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="Close menu"
          onClick={() => {
            setDrawer(false);
            menu.current?.focus();
          }}
        >
          <X />
        </button>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {navigation.map(([name, Icon]) => (
            <button
              key={name}
              title={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              aria-current={page === name ? "page" : undefined}
              onClick={() => go(name)}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            Better data.
            <br />
            Better decisions.
          </p>
          <small>v1.0.0</small>
          <button
            className="collapse-control icon-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </aside>
      <main id="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={menu}
              className="mobile-menu icon-button"
              aria-label="Open menu"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <span className="muted">/</span>
            <span>{page}</span>
          </div>
          <div className="search">
            <Search size={15} />
            <input
              ref={search}
              aria-label="Search datasets, columns, or issues"
              placeholder="Search datasets, columns, or issues..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌘ K</kbd>
            {query && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <span className="session-label">Local session</span>
        </header>
        <div className="workspace-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">DATA WORKSPACE</span>
              <h1>{page === "Overview" ? "Dataset Overview" : page}</h1>
              <p>
                Monitor data quality, detect drift, and review dataset health.
              </p>
            </div>
            <div className="actions">
              <button disabled={busy || !file} onClick={() => void run()}>
                <Play size={14} />
                Run Analysis
              </button>
              <button disabled={busy} onClick={() => go("Drift")}>
                <GitCompareArrows size={14} />
                Compare
              </button>
              <div className="export-control">
                <select
                  aria-label="Export format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="pdf">PDF</option>
                  <option value="json">JSON</option>
                  <option value="csv">CSV issues</option>
                </select>
                <button
                  disabled={!report || busy}
                  onClick={() => void exportCurrent()}
                >
                  <Download size={14} />
                  Export
                </button>
              </div>
            </div>
          </div>
          {status && (
            <p role="status" className="status-line">
              {busy && <span className="loading-dot" />}
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          {query && (
            <section className="panel search-results">
              <h2>Search results</h2>
              <p className="muted">
                Columns and issues below are filtered by “{query}”.
              </p>
              {matches.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setReport(r);
                    setPage("Overview");
                  }}
                >
                  {r.filename}
                </button>
              ))}
              {report && (
                <div className="search-column-list">
                  {report.columns
                    .filter((c) =>
                      c.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((c) => (
                      <button key={c.name} onClick={() => go("Data Quality")}>
                        {c.name} · {c.dtype}
                      </button>
                    ))}
                  {report.issues
                    .filter((i) =>
                      `${i.column} ${i.issue_type} ${i.description}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .slice(0, 10)
                    .map((i, n) => (
                      <button key={n} onClick={() => go("Data Quality")}>
                        {i.column} · {i.issue_type}
                      </button>
                    ))}
                </div>
              )}
            </section>
          )}
          <Suspense fallback={<p role="status">Loading workspace…</p>}>
            {(page === "Overview" || page === "Upload") && (
              <>
                {page === "Upload" ? (
                  <div className="upload-page">
                    <Upload file={file} onFile={setFile} disabled={busy} />
                    <p className="muted">
                      UTF-8 comma-separated files with unique, nonempty headers.
                      Choose your file, then select Run Analysis.
                    </p>
                    <button disabled={busy} onClick={() => void run(true)}>
                      Load Sample Dataset
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="metrics-row">
                      <Upload file={file} onFile={setFile} disabled={busy} />
                      {[
                        [
                          ShieldCheck,
                          "Quality Score",
                          report ? `${fmt(report.quality_score)} / 100` : "—",
                          "AnalySet quality heuristic",
                        ],
                        [
                          CircleAlert,
                          "Missing Values",
                          report ? `${fmt(report.missing_percentage)}%` : "—",
                          report
                            ? `${fmt(report.missing_count, 0)} missing cells`
                            : "Across all cells",
                        ],
                        [
                          Copy,
                          "Duplicates",
                          report ? `${fmt(report.duplicate_percentage)}%` : "—",
                          report
                            ? `${fmt(report.duplicate_count, 0)} duplicate rows`
                            : "Exact repeated rows",
                        ],
                        [
                          Database,
                          "Schema Issues",
                          report ? String(report.schema_issues) : "—",
                          "Inferred schema checks",
                        ],
                        [
                          GitCompareArrows,
                          "Drift Status",
                          drift ? drift.overall : "—",
                          drift
                            ? `${drift.drifted} columns with drift`
                            : "No comparison yet",
                        ],
                      ].map(([Icon, label, value, sub]) => {
                        const MetricIcon = Icon as typeof ShieldCheck;
                        return (
                          <section className="metric" key={String(label)}>
                            <div className="metric-label">
                              <MetricIcon size={16} />
                              <span>{String(label)}</span>
                            </div>
                            <div className="metric-value">{String(value)}</div>
                            <small>{String(sub)}</small>
                          </section>
                        );
                      })}
                    </div>
                    {!report ? (
                      <section className="empty-state">
                        <Database size={30} />
                        <h2>No dataset analyzed yet.</h2>
                        <p>Upload a CSV or load a sample dataset to begin.</p>
                        <button disabled={busy} onClick={() => void run(true)}>
                          Load Sample Dataset
                        </button>
                      </section>
                    ) : (
                      <>
                        <div className="dataset-meta">
                          <span>
                            <Database size={13} />
                            {report.filename}
                          </span>
                          <span>{fmt(report.row_count, 0)} rows</span>
                          <span>{report.column_count} columns</span>
                          <span>{fmt(report.file_size / 1024)} KB file</span>
                          <span>
                            {fmt(report.memory_usage / 1024 / 1024)} MB memory
                          </span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setReport(null);
                              setFile(null);
                              setStatus(
                                "Dataset removed from the workspace. Reports remain in this session.",
                              );
                            }}
                          >
                            Remove dataset
                          </button>
                        </div>
                        <div className="charts-grid">
                          <Trends history={reports} />
                          <MissingChart report={report} />
                        </div>
                        <div className="issues-grid">
                          <Issues issues={report.issues} query={query} />
                          <section className="panel summary-panel">
                            <div className="panel-heading">
                              <h2>Analysis Summary</h2>
                              <ShieldCheck size={16} />
                            </div>
                            <span className="eyebrow">CALCULATED FINDINGS</span>
                            <ul>
                              {report.summary.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                            {drift && (
                              <p>
                                <Severity value={drift.overall} /> distribution
                                drift across {drift.analyzed} columns.
                              </p>
                            )}
                            <small>
                              Rules-based findings · no external AI service
                            </small>
                          </section>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {page === "Data Quality" &&
              (report ? (
                <Quality report={report} query={query} />
              ) : (
                <div className="empty-state">
                  <h2>No dataset analyzed yet.</h2>
                  <button onClick={() => go("Upload")}>Upload a dataset</button>
                </div>
              ))}
            {page === "Drift" && (
              <Drift
                settings={settings}
                reports={reports}
                result={comparison}
                onReport={add}
                onResult={(r) => {
                  setComparison(r);
                  setComparisons((prev) => ({ ...prev, [r.current_id]: r }));
                }}
              />
            )}
            {page === "Reports" && (
              <Reports
                reports={reports}
                comparisons={comparisons}
                onOpen={(r) => {
                  setReport(r);
                  go("Overview");
                }}
              />
            )}
            {page === "Settings" && (
              <SettingsPage
                settings={settings}
                onSave={(s) => {
                  setSettings(s);
                  try {
                    localStorage.setItem(
                      "analyset-settings",
                      JSON.stringify(s),
                    );
                  } catch {
                    setError(
                      "Settings applied, but browser storage is unavailable.",
                    );
                  }
                }}
              />
            )}
          </Suspense>
          <footer>
            AnalySet <span>Dataset intelligence, explained.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
