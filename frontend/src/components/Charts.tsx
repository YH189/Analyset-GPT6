import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import type { Analysis } from "../lib/types";
const tooltip = {
  contentStyle: {
    background: "#181818",
    border: "1px solid #292929",
    fontSize: 12,
    color: "#f2f2f2",
  },
  itemStyle: { color: "#ccc" },
};
const metrics = {
  quality_score: "Quality Score",
  missing_percentage: "Missing %",
  duplicate_percentage: "Duplicates",
  schema_issues: "Schema Issues",
};
export function Trends({ history }: { history: Analysis[] }) {
  const [metric, setMetric] = useState<keyof typeof metrics>("quality_score");
  const data = useMemo(
    () =>
      history.map((r, i) => ({
        name: String(i + 1),
        value: r[metric],
        filename: r.filename,
      })),
    [history, metric],
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Dataset Trends</h2>
        <select
          aria-label="Trend metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value as keyof typeof metrics)}
        >
          {Object.entries(metrics).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {history.length < 2 ? (
        <div className="chart-empty">
          <span>
            {history.length ? "One analysis recorded" : "No analysis history"}
          </span>
          <small>
            Analyze another dataset to compare session results over time.
          </small>
        </div>
      ) : (
        <>
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid stroke="#252525" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#737373"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#737373"
                  fontSize={11}
                  tickLine={false}
                  width={35}
                />
                <Tooltip {...tooltip} />
                <Line
                  dataKey="value"
                  name={metrics[metric]}
                  stroke="#6999e5"
                  strokeWidth={1}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <small>Session analysis order · datasets may differ</small>
        </>
      )}
    </section>
  );
}
export function MissingChart({ report }: { report: Analysis }) {
  const [sort, setSort] = useState(true);
  const data = useMemo(() => {
    const cols = [...report.columns];
    if (sort) cols.sort((a, b) => b.missing_percentage - a.missing_percentage);
    return cols.slice(0, 12);
  }, [report, sort]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Missing Values by Column</h2>
        <button className="text-button" onClick={() => setSort(!sort)}>
          {sort ? "Highest first" : "File order"}
        </button>
      </div>
      <div className="chart">
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 0, right: 20 }}
          >
            <CartesianGrid stroke="#252525" horizontal={false} />
            <XAxis type="number" unit="%" stroke="#737373" fontSize={11} />
            <YAxis
              type="category"
              dataKey="name"
              width={95}
              stroke="#a5a5a5"
              fontSize={11}
              tickLine={false}
              tickFormatter={(v) =>
                String(v).length > 14 ? `${String(v).slice(0, 12)}…` : v
              }
            />
            <Tooltip {...tooltip} formatter={(v) => [`${v}%`, "Missing"]} />
            <Bar
              dataKey="missing_percentage"
              fill="#638fcc"
              barSize={9}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <small>
        Showing {data.length} of {report.column_count} columns · counts in Data
        Quality
      </small>
    </section>
  );
}
