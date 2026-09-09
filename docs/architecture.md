# Architecture and deployment

The browser sends CSV bytes and validated settings to FastAPI. Parsing validates record structure before loading original lexical values into Pandas. Analysis derives type, missingness, statistics, findings and quality components. The bounded server store retains the original frame and immutable analysis result for later comparison. Reports serialize those results to PDF/JSON/CSV.

The API is intentionally separated from the interface. `parsing.py` owns file constraints, `analysis.py` owns quality calculations, `drift.py` owns statistical comparison, `reports.py` owns printable output, and `models.py` owns settings and response contracts. `main.py` coordinates these modules and session storage. Frontend secondary pages are dynamically imported; all HTTP access is centralized in `lib/api.ts`.

## Deployment

Deploy the frontend build directory to a static host and the backend to a Python 3.12 service. The backend includes its sample datasets under `app/sample_data`, so deploying with `backend` as the service root preserves sample loading. The root `sample-data` directory contains matching downloadable examples; a regression test prevents them from diverging. Set the frontend API origin before building and backend CORS origins before startup. A same-origin reverse proxy avoids cross-origin configuration. Run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` from `backend` behind the proxy.

Do not expose this local-first service as an unrestricted public upload endpoint. Add authentication and request/rate limits at the gateway, TLS, resource monitoring and an appropriate privacy policy. Gateway request-body limits must account for multipart overhead. No deployment provider credentials are stored in this project.

## Resource lifecycle

Uploads are read up to the configured file cap plus one byte, validated, then closed. One profiling operation can run at a time; concurrent attempts receive 429. Default limits are 500 columns, 1 million rows and 5 million cells. Reports are retained for up to one hour, at most 20 globally, within a 512 MiB retained-frame budget. Expiration is pruned on access; eviction may happen earlier under memory pressure. The limit does not include Python/framework overhead or temporary computation allocations.

Numeric drift samples at most 10,000 finite values per side; categorical drift uses all observed categories. Full profiling remains in-memory rather than streaming. Large reports and PDFs can be expensive. Scale-out requires a shared store, admission control and background jobs; simply increasing Uvicorn workers would break session report lookup.

## Live deployment

- Frontend: https://analyset.netlify.app
- Backend: https://analyset-api.onrender.com
- Health: https://analyset-api.onrender.com/api/health
- Source: https://github.com/YH189/analyset, branch `main`.

The existing Netlify project publishes `dist` relative to base `frontend`, after `npm run build`. Root `netlify.toml` configures the SPA fallback, security headers and public build variables. `VITE_API_BASE_URL=https://analyset-api.onrender.com` is a public API origin, not a secret. Vite embeds it at build time; changing it requires a fresh deployment. Production is public; deploy previews retain team sign-in protection.

The existing Render service `analyset-api` runs in My Workspace, Singapore, on the free plan. Its repository root is unchanged: the build command is `cd backend && pip install -r requirements.txt`; the start command is `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`. The single worker is required for the in-memory session store. Python is pinned to 3.12.13 in the service environment.

`CORS_ORIGINS=https://analyset.netlify.app` permits the frontend origin. Browser requests include `X-Session-ID`; CORS is not authentication. The root health response supports GET/HEAD probes; `/api/health` returns structured status.

### Public demo limits

| Variable | Value |
| --- | --- |
| `MAX_UPLOAD_MB` | 10 |
| `MAX_COLUMNS` | 500 |
| `MAX_ROWS` | 100000 |
| `MAX_CELLS` | 500000 |
| `MAX_REPORTS` | 10 globally |
| `REPORT_TTL_SECONDS` | 3600 |
| `MAX_MEMORY_MB` | 128 retained-frame budget |
| `DEMO_REQUESTS_PER_MINUTE` | 60 globally |
| `VITE_PUBLIC_DEMO` | true |
| `VITE_MAX_UPLOAD_MB` | 10 |

One POST runs at a time in demo mode; overlapping requests receive HTTP 429 with Retry-After. These limits protect a small shared demonstration service, not an authenticated production data platform. Free Render instances sleep when idle. Reports may disappear on restart, expiration or eviction. Memory limits exclude framework and intermediate processing overhead. Do not upload personal, confidential or sensitive data.
