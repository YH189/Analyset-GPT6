# Architecture and deployment

The browser sends CSV bytes and validated settings to FastAPI. Parsing validates record structure before loading original lexical values into Pandas. Analysis derives type, missingness, statistics, findings and quality components. The bounded server store retains the original frame and immutable analysis result for later comparison. Reports serialize those results to PDF/JSON/CSV.

The API is intentionally separated from the interface. `parsing.py` owns file constraints, `analysis.py` owns quality calculations, `drift.py` owns statistical comparison, `reports.py` owns printable output, and `models.py` owns settings and response contracts. `main.py` coordinates these modules and session storage. Frontend secondary pages are dynamically imported; all HTTP access is centralized in `lib/api.ts`.

## Deployment

Deploy the frontend build directory to a static host and the backend to a Python 3.12 service. The backend includes its sample datasets under `app/sample_data`, so deploying with `backend` as the service root preserves sample loading. The root `sample-data` directory contains matching downloadable examples; a regression test prevents them from diverging. Set the frontend API origin before building and backend CORS origins before startup. A same-origin reverse proxy avoids cross-origin configuration. Run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` from `backend` behind the proxy.

Do not expose this local-first service as an unrestricted public upload endpoint. Add authentication and request/rate limits at the gateway, TLS, resource monitoring and an appropriate privacy policy. Gateway request-body limits must account for multipart overhead. No deployment provider credentials are stored in this project.

## Resource lifecycle

Uploads are read up to the configured file cap plus one byte, validated, then closed. One profiling operation can run at a time; concurrent attempts receive 429. Default limits are 500 columns, 1 million rows and 5 million cells. Reports are retained for up to one hour, at most 20 globally, within a 512 MiB retained-frame budget. Expiration is pruned on access; eviction may happen earlier under memory pressure. The limit does not include Python/framework overhead or temporary computation allocations.

Numeric drift samples at most 10,000 finite values per side; categorical drift uses all observed categories. Full profiling remains in-memory rather than streaming. Large reports and PDFs can be expensive. Scale-out requires a shared store, admission control and background jobs; simply increasing Uvicorn workers would break session report lookup.

## Netlify and Render deployment continuation

The existing Netlify project is `analyset` (`476c4d79-5a97-4341-a2a2-ab1f521fb9a5`). Root `netlify.toml` sets base `frontend`, build `npm run build`, and publish `dist`, plus the SPA fallback. Do not set publish to `frontend/dist` when the base is already `frontend`.

Render must use root `backend`, Python 3.12, build `pip install -r requirements.txt`, and start `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`. `backend/.python-version` pins the Python minor version. The deployment uses one worker to preserve report lookup.

Configure Render `CORS_ORIGINS` with only the final HTTPS Netlify origin. Configure Netlify `VITE_API_BASE_URL` with the real Render HTTPS origin, without `/api`, then rebuild. Netlify also enables `VITE_PUBLIC_DEMO=true` to display the no-sensitive-data notice.

Deployment is not complete until the Render connection is authorized, both services are configured and the live analysis/comparison/export workflow is verified. No backend URL is invented or embedded in this preparation step. The public demo must not be used for sensitive data; additional production abuse controls are assessed before enabling public access.
