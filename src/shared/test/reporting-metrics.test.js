import assert from "node:assert/strict";
import test from "node:test";

import { createMetricsTracker } from "../src/reporting/index.js";

test("snapshot exposes accumulated metrics as plain objects", () => {
    const tracker = createMetricsTracker({ category: "demo" });

    const stopTiming = tracker.timers.startTimer("parse");
    stopTiming();
    tracker.counters.increment("files");
    tracker.caches.recordHit("project-index");
    tracker.caches.recordMiss("project-index");
    tracker.caches.recordStale("project-index");
    tracker.caches.recordHit("project-index");
    tracker.reporting.setMetadata("mode", "test");

    const report = tracker.reporting.snapshot({
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
    tracker.caches.recordHit("default");

    const report = tracker.reporting.snapshot();
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

    tracker.counters.increment("items", 3);
    const report = tracker.reporting.finalize({ counters: { extra: 1 } });
    const second = tracker.reporting.finalize({ counters: { extra: 999 } });

    assert.deepEqual(report.counters, { items: 3, extra: 1 });
    assert.equal(events.length, 1);
    assert.equal(events[0].message, "[auto] summary");
    assert.deepEqual(events[0].payload, report);
    assert.deepEqual(second.counters, { extra: 999 });
    assert.equal(events.length, 1);
});

test("cache keys are configurable and support custom metrics", () => {
    const tracker = createMetricsTracker({
        cacheKeys: ["hits", "evictions"],
        category: "custom"
    });

    tracker.caches.recordHit("store");
    tracker.caches.recordMetric("store", "evictions", 2);
    tracker.caches.recordMetric("store", "misses", 3);

    const report = tracker.reporting.snapshot();
    assert.deepEqual(report.caches.store, {
        hits: 1,
        evictions: 2,
        misses: 3
    });
});

test("cache key normalization accepts delimited strings", () => {
    const tracker = createMetricsTracker({ cacheKeys: " hits , misses " });

    tracker.caches.recordHit("store");
    tracker.caches.recordMetric("store", "misses", 2);

    const report = tracker.reporting.snapshot();
    assert.deepEqual(report.caches.store, {
        hits: 1,
        misses: 2
    });
});

test("cache key normalization trims duplicates from iterable input", () => {
    const tracker = createMetricsTracker({
        cacheKeys: new Set([" hits ", "", "misses", "hits"])
    });

    tracker.caches.recordHit("store");
    tracker.caches.recordMetric("store", "misses", 2);

    const report = tracker.reporting.snapshot();
    assert.deepEqual(report.caches.store, {
        hits: 1,
        misses: 2
    });
});

test("cache key normalization falls back to defaults when empty", () => {
    const tracker = createMetricsTracker({ cacheKeys: [null, undefined] });
    tracker.caches.recordHit("store");

    const report = tracker.reporting.snapshot();
    assert.deepEqual(report.caches.store, {
        hits: 1,
        misses: 0,
        stale: 0
    });
});

test("snapshot returns fresh copies of accumulated metrics", () => {
    const tracker = createMetricsTracker({ category: "clone" });
    tracker.counters.increment("runs");
    tracker.caches.recordHit("cache");

    const first = tracker.reporting.snapshot();
    first.counters.runs = 99;
    first.caches.cache.hits = 42;

    const second = tracker.reporting.snapshot();
    assert.deepEqual(second.counters, { runs: 1 });
    assert.deepEqual(second.caches.cache, { hits: 1, misses: 0, stale: 0 });
});
