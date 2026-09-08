import { defineConfig } from "@playwright/test";
const liveOrigin = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: liveOrigin || "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: [
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
          ],
        }
      : {},
  },
  reporter: "list",
  webServer: liveOrigin
    ? undefined
    : [
        {
          command: process.env.CI
            ? "cd ../backend && python -m uvicorn app.main:app --port 8000"
            : "cd ../backend && .venv/bin/python -m uvicorn app.main:app --port 8000",
          url: "http://127.0.0.1:8000/api/health",
          reuseExistingServer: !process.env.CI,
        },
        {
          command: "npm run dev -- --host 127.0.0.1",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: !process.env.CI,
        },
      ],
});
