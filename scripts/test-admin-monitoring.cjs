/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/components/admin/monitoring-helpers.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const helpers = {};
new Function('exports', compiled.outputText)(helpers);

const timeseries = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/admin/monitoring-timeseries-data.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(timeseries);
const point = (seconds, value) => ({ timestampUtc: new Date(Date.UTC(2026, 9, 22, 8, 0, seconds)).toISOString(), value });
const payload = (points = []) => ({ range: '1h', stepSeconds: 15, series: { requestsPerSecond: points, p95LatencyMilliseconds: [], http5xxErrorRatePercent: [] } });

test('metrics distinguish null/missing values from a genuine zero', () => {
  for (const value of [undefined, null, NaN, Infinity, -1, '0']) {
    assert.equal(helpers.formatMonitoringMetric(value, '%'), 'N/A');
  }
  assert.equal(helpers.formatMonitoringMetric(0, '%'), '0%');
  assert.equal(helpers.formatMonitoringMetric(100, '%'), '100%');
  assert.equal(helpers.formatMonitoringMetric(0.091233, 'req/s'), '0.09 req/s');
  assert.equal(helpers.formatMonitoringMetric(42.2486, 'ms'), '42.25 ms');
});

test('service health comes only from supported health values', () => {
  for (const state of ['Healthy', 'Unhealthy', 'Degraded', 'Unknown']) {
    assert.equal(helpers.monitoringHealth(state), state);
  }
  for (const state of [null, undefined, 'Offline', 100, true]) {
    assert.equal(helpers.monitoringHealth(state), 'Unknown');
  }
  assert.equal(helpers.monitoringHealth(' healthy '), 'Healthy');
  assert.equal(helpers.hasMonitoringData(null), false);
  assert.equal(helpers.hasMonitoringData({}), false);
  assert.equal(helpers.hasMonitoringData({ requestsPerSecond: 0 }), true);
  assert.equal(helpers.hasMonitoringData({ apiHealth: 'Degraded' }), true);
});

test('observation metadata handles missing/invalid values', () => {
  assert.equal(helpers.formatMonitoringWindow('5m'), '5 phút');
  assert.equal(helpers.formatMonitoringWindow('30s'), '30 giây');
  assert.equal(helpers.formatMonitoringWindow(null), 'N/A');
  assert.equal(helpers.formatMonitoringTime(null), 'N/A');
  assert.equal(helpers.formatMonitoringTime('invalid'), 'N/A');
  assert.notEqual(helpers.formatMonitoringTime('2026-10-22T08:28:59Z'), 'N/A');
});

test('monitoring links are optional and reject credentials or executable URLs', () => {
  for (const url of [undefined, '', 'bad-url', 'javascript:alert(1)', 'data:text/html,test',
    'https://user:password@grafana.test/d/monitoring', 'https://grafana.test/d/monitoring?api_key=secret',
    'https://grafana.test/d/monitoring?token=secret']) {
    assert.equal(helpers.monitoringDashboardUrl(url), null);
  }
  assert.equal(helpers.monitoringDashboardUrl('https://grafana.test/d/monitoring?orgId=1'), 'https://grafana.test/d/monitoring?orgId=1');
  assert.equal(helpers.monitoringDashboardUrl('https://prometheus.test/query'), 'https://prometheus.test/query');
});

test('time-series follows the real nested DTO and preserves UTC timestamp precision', () => {
  const timestampUtc = '2026-10-22T08:00:07.0370000+00:00';
  const input = payload([{ timestampUtc, value: 0.006506202534464712 }]);
  const result = timeseries.parseMonitoringTimeseries(input, '1h');
  assert.deepEqual(result, input);
  assert.equal(result.series.requestsPerSecond[0].timestampUtc, timestampUtc);
  assert.deepEqual(result.series.http5xxErrorRatePercent, []);
  assert.throws(() => timeseries.parseMonitoringTimeseries(input, '6h'));
  assert.throws(() => timeseries.parseMonitoringTimeseries({}, '1h'));
  assert.throws(() => timeseries.parseMonitoringTimeseries({ ...input, stepSeconds: 5 }, '1h'));
  assert.throws(() => timeseries.parseMonitoringTimeseries(payload([{ timestampUtc: '2026-10-22T08:00:00', value: 1 }]), '1h'));
});

test('missing and invalid values are gaps, genuine zero is retained', () => {
  const input = payload([point(0, 0), point(15, null), point(30, NaN), point(45, -1), point(60, 1)]);
  const result = timeseries.parseMonitoringTimeseries(input, '1h');
  assert.deepEqual(result.series.requestsPerSecond.map(p => p.value), [0, null, null, null, 1]);
  const segments = timeseries.splitMonitoringSegments(result.series.requestsPerSecond, 15);
  assert.equal(segments.length, 2);
  assert.equal(segments[0][0].value, 0);
  assert.equal(segments[1][0].value, 1);
});

test('omitted samples break line segments without inserting fabricated points', () => {
  const points = [point(0, 1), point(15, 2), point(45, 3), point(60, 4)];
  const segments = timeseries.splitMonitoringSegments(points, 15);
  assert.deepEqual(segments.map(segment => segment.length), [2, 2]);
  assert.equal(segments.flat().length, points.length);
  assert.deepEqual(timeseries.splitMonitoringSegments([point(0, null)], 15), []);
  assert.deepEqual(timeseries.splitMonitoringSegments([], 15), []);
});

test('samples sort/deduplicate without mutating the API payload; unchanged refreshes retain identity', () => {
  const input = payload([point(30, 3), point(0, 1), point(15, 2), point(15, null)]);
  const original = JSON.stringify(input);
  const a = timeseries.parseMonitoringTimeseries(input, '1h');
  const b = timeseries.parseMonitoringTimeseries(input, '1h');
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(a.series.requestsPerSecond.map(p => p.value), [1, null, 3]);
  assert.equal(timeseries.sameMonitoringTimeseries(a, b), true);
  b.series.requestsPerSecond[0].value = 5;
  assert.equal(timeseries.sameMonitoringTimeseries(a, b), false);
  assert.equal(timeseries.sameMonitoringTimeseries(null, a), false);
});

test('time bounds use server timestamps and all four real ranges', () => {
  assert.equal(timeseries.monitoringTimeBounds(payload()), null);
  for (const [range, duration] of [['15m', 900000], ['1h', 3600000], ['6h', 21600000], ['24h', 86400000]]) {
    const data = { ...payload([point(0, 1), point(15, 2)]), range };
    const bounds = timeseries.monitoringTimeBounds(data);
    assert.equal(bounds.end, Date.parse(point(15, 2).timestampUtc));
    assert.equal(bounds.end - bounds.start, duration);
  }
});

test('24 hours at 15-second resolution keeps all measurements', () => {
  const points = Array.from({ length: 5761 }, (_, i) => point(i * 15, i));
  const data = timeseries.parseMonitoringTimeseries({ ...payload(points), range: '24h' }, '24h');
  assert.equal(data.series.requestsPerSecond.length, 5761);
  assert.equal(timeseries.splitMonitoringSegments(data.series.requestsPerSecond, 15).length, 1);
});
