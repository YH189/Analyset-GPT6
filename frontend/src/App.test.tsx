import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, test, expect } from "vitest";
import App from "./App";
import { Upload } from "./components/Upload";
import { Severity } from "./components/Issues";
import * as api from "./lib/api";
import { defaults, type Analysis } from "./lib/types";
vi.mock("./lib/api", () => ({
  sample: vi.fn(),
  analyze: vi.fn(),
  compare: vi.fn(),
  exportReport: vi.fn(),
}));
const report: Analysis = {
  id: "report-1",
  timestamp: "2026-01-01T00:00:00Z",
  filename: "customers.csv",
  file_size: 123,
  memory_usage: 300,
  row_count: 10,
  column_count: 1,
  missing_count: 2,
  missing_percentage: 20,
  duplicate_count: 1,
  duplicate_percentage: 10,
  schema_issues: 0,
  quality_score: 92,
  components: {
    Completeness: 80,
    Uniqueness: 90,
    Validity: 100,
    Consistency: 100,
    "Schema Health": 100,
  },
  columns: [],
  issues: [],
  summary: ["10 rows analyzed."],
  settings: defaults,
};
test("empty dashboard has no fabricated metrics and disabled actions", () => {
  render(<App />);
  expect(screen.getByText("No dataset analyzed yet.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Run Analysis" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
});
test("upload validates extension, empty file, accepts CSV and removes it", async () => {
  const callback = vi.fn();
  const { rerender } = render(<Upload file={null} onFile={callback} />);
  const input = screen.getByLabelText("Upload Dataset", { selector: "input" });
  fireEvent.change(input, { target: { files: [new File(["x"], "bad.txt")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a .csv");
  fireEvent.change(input, { target: { files: [new File([], "empty.csv")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("empty");
  const file = new File(["a\n1"], "good.csv");
  fireEvent.change(input, { target: { files: [file] } });
  expect(callback).toHaveBeenCalledWith(file);
  rerender(<Upload file={file} onFile={callback} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Remove selected file" }),
  );
  expect(callback).toHaveBeenCalledWith(null);
});
test("severity uses text and a dot without a badge", () => {
  const { container } = render(<Severity value="High" />);
  expect(screen.getByText("High")).toBeVisible();
  expect(container.querySelector(".dot.high")).toBeTruthy();
  expect(container.querySelector(".badge")).toBeNull();
});
test("loading, calculated metrics, search and export", async () => {
  let resolve!: (r: Analysis) => void;
  vi.mocked(api.sample).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<App />);
  await userEvent.click(
    screen.getByRole("button", { name: "Load Sample Dataset" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading and analyzing");
  resolve(report);
  await screen.findByText("customers.csv");
  expect(screen.getByText("92 / 100")).toBeVisible();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(screen.getByRole("textbox")).toHaveFocus();
  await userEvent.type(screen.getByRole("textbox"), "customers");
  expect(screen.getByRole("heading", { name: "Search results" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Export" }));
  expect(api.exportReport).toHaveBeenCalledWith("report-1", "pdf");
});
test("API error is readable", async () => {
  vi.mocked(api.sample).mockRejectedValue(new Error("Server unavailable"));
  render(<App />);
  await userEvent.click(
    screen.getByRole("button", { name: "Load Sample Dataset" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Server unavailable",
  );
});
test("navigation, comparison and responsive menu controls", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Compare" }));
  expect(
    await screen.findByRole("heading", {
      name: "Baseline / Current Comparison",
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Compare datasets" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(
    await screen.findByRole("heading", { name: "Analysis Settings" }),
  ).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
  expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    ),
  );
});
