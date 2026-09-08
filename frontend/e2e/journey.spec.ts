import { test, expect } from "@playwright/test";
import path from "node:path";
const data = (name: string) =>
  path.resolve("../sample-data", `customers_${name}.csv`);
test("upload, inspect, compare, report, export and settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("No dataset analyzed yet.")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(data("problematic"));
  await page.getByRole("button", { name: "Run Analysis" }).click();
  await expect(page.getByText("Analysis complete.")).toBeVisible();
  await expect(page.getByText("183 rows", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Detected Issues" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Data Quality", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Column Profiles" }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox")).toBeFocused();
  await page.getByRole("textbox").fill("revenue");
  await expect(
    page.getByRole("heading", { name: "Search results" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Drift", exact: true }).click();
  await page.locator("input[type=file]").nth(0).setInputFiles(data("baseline"));
  await page.locator("input[type=file]").nth(1).setInputFiles(data("drifted"));
  await page
    .getByRole("button", { name: "Compare datasets", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Drift Results" }),
  ).toBeVisible();
  await expect(page.getByText("High", { exact: true }).first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs("/tmp/analyset-report.pdf");
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open report" })).toHaveCount(
    3,
  );
  await page.getByRole("button", { name: "Open report" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Dataset Overview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("IQR multiplier").fill("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByText("Settings saved for future analyses."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("malformed upload and sample loading", async ({ page }) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "malformed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2,3"),
  });
  await page.getByRole("button", { name: "Run Analysis" }).click();
  await expect(page.getByRole("alert")).toContainText("expected 2");
  await page.getByRole("button", { name: "Load Sample Dataset" }).click();
  await expect(page.getByText("Analysis complete.")).toBeVisible();
});
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [393, 852],
  [390, 844],
  [360, 800],
]) {
  test(`responsive ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "Load Sample Dataset" }).click();
    await expect(page.getByText("Analysis complete.")).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `../docs/images/dashboard-${width}.png`,
      fullPage: true,
    });
    if (width <= 1000) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await page
        .getByRole("button", { name: "Data Quality", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Column Profiles" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
      await page.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("button", { name: "Drift", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Drift", exact: true }).click();
    }
    await expect(
      page.getByRole("heading", { name: "Baseline / Current Comparison" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  });
}

test("secondary controls and sample comparison use real results", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load Sample Dataset" }).click();
  await expect(page.getByText("Analysis complete.")).toBeVisible();
  await page.getByRole("button", { name: "Highest first" }).click();
  await expect(
    page.getByRole("button", { name: "File order", exact: true }),
  ).toBeVisible();
  await page.locator("summary").first().click();
  await expect(page.getByText(/CSV record numbers/).first()).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.locator("input[type=file]").setInputFiles(data("clean"));
  await page.getByRole("button", { name: "Run Analysis" }).click();
  await expect(page.getByText("180 rows", { exact: true })).toBeVisible();
  await page.getByLabel("Trend metric").selectOption("missing_percentage");
  await expect(
    page.getByRole("img", { name: "Session metric trend" }),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: "Compare sample datasets" }).click();
  await expect(
    page.getByRole("heading", { name: "Drift Results" }),
  ).toBeVisible();
  for (const format of ["json", "csv"]) {
    await page.getByLabel("Export format").selectOption(format);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    expect((await download).suggestedFilename()).toContain(`.${format}`);
  }
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove dataset", exact: true })
    .click();
  await expect(page.getByText("No dataset analyzed yet.")).toBeVisible();
  expect(errors).toEqual([]);
});
