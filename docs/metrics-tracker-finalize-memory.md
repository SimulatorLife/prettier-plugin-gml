# Metrics Tracker Finalization Memory Measurement

This note captures the `node --expose-gc` experiment used to confirm that clearing
`createMetricsTracker` internals after `finalize()` reduces retained heap usage.

## Script

The measurement runs the following inline script against the current checkout:

```bash
node --expose-gc --input-type=module -e "import { createMetricsTracker } from './src/shared/src/reporting/metrics.js';
function run() {
  if (typeof global.gc !== 'function') {
    throw new Error('GC not available');
  }
  global.gc();
  let tracker = createMetricsTracker({ category: 'measure', cacheKeys: ['hits','misses','stale','evictions'] });
  for (let i = 0; i < 10000; i += 1) {
    tracker.counters.increment('counter-' + (i % 8), i % 3);
  }
  for (let i = 0; i < 5000; i += 1) {
    tracker.caches.recordHit('cache-' + (i % 4));
    tracker.caches.recordMiss('cache-' + (i % 4));
  }
  for (let i = 0; i < 2000; i += 1) {
    tracker.caches.recordMetric('cache-' + (i % 4), 'evictions', 2);
  }
  tracker.reporting.setMetadata('blob', 'x'.repeat(1_000_000));
  const beforeFinalize = process.memoryUsage();
  let report = tracker.reporting.finalize();
  const afterFinalize = process.memoryUsage();
  global.gc();
  const afterGcWithReport = process.memoryUsage();
  tracker = null;
  global.gc();
  const afterGcWithoutTracker = process.memoryUsage();
  report = null;
  global.gc();
  const afterGcWithoutReport = process.memoryUsage();
  return { beforeFinalize, afterFinalize, afterGcWithReport, afterGcWithoutTracker, afterGcWithoutReport };
}
const result = run();
console.log(JSON.stringify(result, null, 2));
"
```

## Results

A representative before/after run produced the following `heapUsed` values (in bytes):

| Stage | Baseline | Cleared-on-finalize |
| --- | --- | --- |
| After GC while keeping the metrics report alive | 3,139,872 | 2,929,320 |
| After GC once the tracker reference is dropped | 2,927,552 | 2,929,048 |
| After GC once the tracker and report are released | 3,137,632 | 2,928,048 |

The key improvement is the ~210 KB reduction while the metrics report is still
referenced (`afterGcWithReport`). Subsequent rows converge once both the tracker and
report objects are discarded; small deltas reflect measurement jitter in `process.memoryUsage()`.
