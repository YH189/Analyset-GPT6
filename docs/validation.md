# Validation record

Validated in the build environment on 2026-09-08 using Python 3.12 and Node.js 24. CI is configured for Python 3.12 and Node.js 22.

| Check | Result |
| --- | --- |
| Backend Ruff | PASS |
| Backend Pytest | PASS — 21 tests |
| Frontend ESLint | PASS |
| TypeScript | PASS |
| Vitest / React Testing Library | PASS — 6 tests |
| Prettier source check | PASS |
| Vite production build | PASS |
| Playwright | PASS — 13 tests |
| Python dependency compatibility (`pip check`) | PASS |
| npm audit, production and full tree | 0 reported vulnerabilities |
| pip-audit, requirements and resolved dependencies | 0 reported vulnerabilities after updates |
| PDF render review | PASS — embedded fonts, real calculated report |

Browser tests ran against the actual React/FastAPI application. Covered file upload, quality inspection, search, baseline/current uploads, sample comparison, PDF/JSON/CSV downloads, report opening, settings, malformed CSV, empty states, sorting, issue expansion, history sparklines, sidebar collapse and dataset removal. Browser error listeners found no page runtime errors in the main workflow and no console errors in the secondary-controls workflow.

Responsive tests rendered and captured 1920×1080, 1440×900, 1366×768, 1280×800, 1024×768, 768×1024, 430×932, 393×852, 390×844 and 360×800. All passed page-level horizontal-overflow assertions. Mobile navigation and quality table overflow were exercised. Captured screenshots were visually reviewed; tables intentionally scroll within their containers.

## Commands executed

From the repository root:

```sh
backend/.venv/bin/ruff check backend
backend/.venv/bin/pytest backend/tests -q
backend/.venv/bin/python -m compileall -q backend/app
backend/.venv/bin/pip check
backend/.venv/bin/pip-audit -r backend/requirements.txt --format json
```

From `frontend`:

```sh
npm install
npm run lint
npm run typecheck
npm run test
npm run format:check
npm run build
npm audit --omit=dev --json
npm audit --json
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/analyset-chromium npm run test:e2e
```

The standard Playwright Chromium download timed out in this environment. Browser tests therefore used a locally extracted Chromium 149 executable from the npm-distributed `@sparticuz/chromium` package through the supported executable override. That temporary package and browser are not project dependencies. Normal installations and CI use `npx playwright install chromium` and `npm run test:e2e`.

## Scope and remaining limits

The checks are evidence of tested behavior, not a bug-free guarantee. They do not certify every possible CSV or benchmark 100 MB workloads. Browser coverage is Chromium only; macOS, Windows and other engines were not executed locally. Backend tests emit upstream test-client deprecation warnings. JSDOM emits chart-size warnings because it does not perform layout; real-browser chart dimensions were checked separately.

The public demo is hosted on [Netlify](https://analyset.netlify.app) with the [Render API](https://analyset-api.onrender.com). It uses smaller resource limits and global request throttling; it is intended for sample or non-sensitive data. See [live deployment](architecture.md#live-deployment) for the configuration and limitations. The local test results above are distinct from live production checks.


## Live deployment verification — 2026-09-09

The existing Netlify production deployment `6aa05fd3cb700a00084aa7d4` serves the working application at https://analyset.netlify.app. Its JavaScript embeds https://analyset-api.onrender.com. Render deployment `dep-dag5ufn40ujc73eekbv0` is live with backend commit `2121c09`.

Verified against the public application:

- Root loads AnalySet without a Netlify 404.
- Load Sample Dataset returns real results: 183 rows, 44 missing cells, 3 duplicate rows, quality score 92.67.
- CSV upload and Run Analysis passed during the preceding live session.
- Data Quality displays component scores, column profiles and detected issues.
- Compare and Compare sample datasets produce High drift: 4 of 5 analyzed columns, numeric KS and categorical JS details.
- Reports lists the three session analyses and opens the chosen report.
- Search for revenue filters the column/issue results; Clear search restores the view.
- Export reports success in the browser. An independent production API request returned HTTP 200, `application/pdf`, 47,107 bytes, a PDF signature and readable calculated report text. The browser download-event hook timed out, so browser download-file capture is not asserted.
- Health returned HTTP 200 and `status: ok`. Actual sample/export HTTP responses include the exact Netlify Access-Control-Allow-Origin.
- Application console inspection found no application errors; the browser's own extension emitted metadata errors outside the application.
- Desktop live layout at 1363×936 had no page-level horizontal overflow.

### Typography change and deployment blocker

Commit `ea6e43b` uses Raleway lining and tabular numerals throughout the interface. Metric values use weight 400, normal letter spacing, 28px desktop, 26px tablet and 24px mobile (32px on large desktops). Statistical calculations are unchanged.

After this change, `npm run lint`, `npm run typecheck`, `npm run test` (6 tests) and `npm run build` passed. Backend tests were last rerun during deployment continuation: 23 passed, with Ruff passing. Existing local Playwright results above predate this typography change; they are not a claim of live mobile verification.

Attempted production deployment `6aa0d9510dac778a92325c1e` failed with **Skipped due to account credit usage exceeded**. The previous production remains active. The typography fix is committed on GitHub but is not live. Publishing it requires Netlify account credits to be restored, followed by a deployment of current main to the existing site. No duplicate site or service was created.

The browser surface did not provide usable viewport resizing. Exact live inspections at 1440, 1366, 768 and 390px remain unverified, especially for the unpublished typography change. Complete those checks after deployment is unblocked. GitHub metadata editing was not available through the connected tool set; live links are documented in README.
