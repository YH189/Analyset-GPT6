# Architecture and deployment

The browser sends CSV bytes and validated settings to FastAPI. Parsing validates record structure before loading original lexical values into Pandas. Analysis derives type, missingness, statistics, findings and quality components. The bounded server store retains the original frame and immutable analysis result for later comparison. Reports serialize those results to PDF/JSON/CSV.

The API is intentionally separated from the interface. `parsing.py` owns file constraints, `analysis.py` owns quality calculations, `drift.py` owns statistical comparison, `reports.py` owns printable output, and `models.py` owns settings and response contracts. `main.py` coordinates these modules and session storage. Frontend secondary pages are dynamically imported; all HTTP access is centralized in `lib/api.ts`.

## Deployment

Deploy the frontend build directory to a static host and the backend to a Python 3.12 service. Preserve the repository's `sample-data` directory at the same level as `backend`. Set the frontend API origin before building and backend CORS origins before startup. A same-origin reverse proxy avoids cross-origin configuration. Run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1` from `backend` behind the proxy.

Do not expose this local-first service as an unrestricted public upload endpoint. Add authentication and request/rate limits at the gateway, TLS, resource monitoring and an appropriate privacy policy. Gateway request-body limits must account for multipart overhead. No deployment provider credentials are stored in this project.

## Resource lifecycle

Uploads are read up to the configured file cap plus one byte, validated, then closed. One profiling operation can run at a time; concurrent attempts receive 429. Default limits are 500 columns, 1 million rows and 5 million cells. Reports are retained for up to one hour, at most 20 globally, within a 512 MiB retained-frame budget. Expiration is pruned on access; eviction may happen earlier under memory pressure. The limit does not include Python/framework overhead or temporary computation allocations.

Numeric drift samples at most 10,000 finite values per side; categorical drift uses all observed categories. Full profiling remains in-memory rather than streaming. Large reports and PDFs can be expensive. Scale-out requires a shared store, admission control and background jobs; simply increasing Uvicorn workers would break session report lookup.
