import assert from "node:assert/strict";
import test from "node:test";

import { createMetricsTracker } from "../reporting.js";

test("snapshot exposes accumulated metrics as plain objects", () => {
    const tracker = createMetricsTracker({ category: "demo" });

    const stopTiming = tracker.startTimer("parse");
    stopTiming();
    tracker.incrementCounter("files");
    tracker.recordCacheHit("project-index");
    tracker.recordCacheMiss("project-index");
    tracker.recordCacheStale("project-index");
    tracker.recordCacheHit("project-index");
    tracker.setMetadata("mode", "test");

    const report = tracker.snapshot({
        counters: { extra: 2 },
        caches: { extraCache: { hits: 5 } },
        metadata: { note: "ok" }
    });

    assert.equal(report.category, "demo");
    assert.ok(report.totalTimeMs >= 0);
    assert.deepEqual(Object.keys(report.timings), ["parse"]);
    assert.deepEqual(report.counters, { files: 1, extra: 2 });
    assert.deepEqual(report.caches["project-index"], {
        hits: 2,
        misses: 1,
        stale: 1
    });
    assert.deepEqual(report.caches.extraCache, { hits: 5 });
    assert.deepEqual(report.metadata, { mode: "test", note: "ok" });
});

test("cache summaries include untouched counters", () => {
    const tracker = createMetricsTracker();
    tracker.recordCacheHit("default");

    const report = tracker.snapshot();
    assert.deepEqual(report.caches.default, {
        hits: 1,
        misses: 0,
        stale: 0
    });
});

test("finalize logs once when auto logging is enabled", () => {
    const events = [];
    const tracker = createMetricsTracker({
        category: "auto",
        autoLog: true,
        logger: {
            debug(message, payload) {
                events.push({ message, payload });
            }
        }
    });

    tracker.incrementCounter("items", 3);
    const report = tracker.finalize({ counters: { extra: 1 } });

    assert.deepEqual(report.counters, { items: 3, extra: 1 });
    assert.equal(events.length, 1);
    assert.equal(events[0].message, "[auto] summary");
    assert.deepEqual(events[0].payload, report);
});

test("cache keys are configurable and support custom metrics", () => {
    const tracker = createMetricsTracker({
        cacheKeys: ["hits", "evictions"],
        category: "custom"
    });

    tracker.recordCacheHit("store");
    tracker.recordCacheMetric("store", "evictions", 2);
    tracker.recordCacheMetric("store", "misses", 3);

    const report = tracker.snapshot();
    assert.deepEqual(report.caches.store, {
        hits: 1,
        evictions: 2,
        misses: 3
    });
});
