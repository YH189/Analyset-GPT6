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

The service remains local/private-first and requires authentication, gateway limits and deployment infrastructure before unrestricted public exposure. The GitHub Actions workflow must be assessed from its actual remote run separately from these local results. No live hosted API/application is asserted by this record.
