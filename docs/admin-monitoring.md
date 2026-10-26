# Admin System Monitoring

- Open `/admin?view=monitoring`, or choose **Giam sat he thong** in the existing Admin sidebar. The normal Admin role guard also protects this view; the backend remains the authorization boundary.
- API: `GET /v1/admin/monitoring/overview`, relative to `EXPO_PUBLIC_API_URL` (which includes `/api`). Uses the existing Bearer token and refresh-token interceptors unchanged.
- Polling runs 30 seconds after the previous request completes, never concurrently. Manual refresh resets that timer. Polling pauses when the browser document or native app is inactive, and stops when this view loses focus/unmounts. In-flight overview requests are aborted on cleanup and time out after 20 seconds. Automatic retries stop on HTTP 401/403.
- KPI values come only from the overview response. Null, missing, non-finite or negative metrics render `N/A`; missing/unrecognized health states render `Unknown`. Failed requests clear the displayed snapshot rather than leaving old Healthy indicators visible.
- `observedAtUtc` is shown in the viewer's local time with its timezone. The observation window is read from the response, not assumed from the polling interval.
- Historical charts use `GET /v1/admin/monitoring/timeseries?range=1h&step=15s` through the same authenticated client. The frontend does not contact Prometheus and never accumulates browser samples as historical monitoring.

## Historical Charts

- Three SVG line charts reuse the installed `react-native-svg`: Request Rate, P95 Response Time and HTTP 5xx Error Rate.
- Ranges: `15m`, `1h` (default), `6h`, `24h`. All requests use `step=15s`. Charts poll independently, 15 seconds after the previous request settles; overview KPIs remain at 30 seconds. No WebSocket/SignalR or new dependencies.
- The response contract is `{ range, stepSeconds, series: { requestsPerSecond, p95LatencyMilliseconds, http5xxErrorRatePercent } }`. Each series contains `{ timestampUtc, value }` samples. UTC strings, including offset/fractional precision, are retained; axes/selected sample labels use the viewer's local timezone. Tap a chart to inspect an actual sample.
- Samples are sorted and deduplicated by timestamp. Null/missing/non-finite/negative values create gaps. A timestamp jump greater than 1.5 sample steps starts a new segment. No interpolation, zero fill or synthesized measurements are used. An empty series renders an empty state; real zero values render at zero. Isolated numeric samples render as dots.
- Changing range or leaving the view aborts the previous request and prevents stale responses from updating the new range. Polling pauses while inactive, deduplicates manual refresh, and stops automatic retries on 401/403. The chart request timeout is 20 seconds.
- A refresh failure retains only the same range's last successful response with an explicit stale-data warning and original sample timestamps. Initial failures show an error/retry state. Authentication failures clear historical data. Identical responses retain the previous data reference so chart paths do not rebuild unnecessarily.

## Monitoring Links

Set `EXPO_PUBLIC_GRAFANA_DASHBOARD_URL` and `EXPO_PUBLIC_PROMETHEUS_URL` to the respective deployed tools' HTTP(S) URLs, then restart/rebuild Expo to apply public environment changes. Each button is disabled when its URL is unset/invalid. Both tools open in a new tab using `noopener noreferrer`, never an iframe.

These settings are public: do not include credentials, access tokens or API keys. URLs with embedded credentials or sensitive query parameter names are rejected. Each monitoring tool must have its own access controls; no localhost fallback or monitoring credentials are bundled. Opening Prometheus is an explicit navigation action; the frontend still fetches all metrics only through the authenticated SFM backend, not Prometheus directly.

## Verification

Run `node --test scripts/test-admin-monitoring.cjs`, `npx tsc --noEmit`, `npx expo lint` and `npx expo export --platform web --output-dir <temporary-directory>`.

Browser integration tests should cover Admin/non-Admin access, real response-field formatting, null/empty data, health states, failed refresh and retry, independent 15/30-second polling, range changes/races, inactive-page pause, request deduplication/cleanup, deep linking, existing sidebar navigation and light/dark responsive layouts. Use intercepted fixtures only in tests; production has no mock monitoring data.
