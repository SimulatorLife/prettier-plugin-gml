import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
    buildLoopInvariantStressBatchSource,
    createOutputHash,
    lintSingleRuleWithTiming,
    runSequentialPerformanceTest,
    STILE_FIXTURE_URL,
    STILE_OPTIMIZE_MATH_OUTPUT_HASH
} from "./performance-test-helpers.js";

runSequentialPerformanceTest(
    "optimize-math-expressions keeps repeated stile rewrites within the cached-normalization budget",
    async () => {
        const source = await readFile(STILE_FIXTURE_URL, "utf8");
        const timedRun = await lintSingleRuleWithTiming("gml/optimize-math-expressions", source, "stile.gml");

        assert.equal(timedRun.messages.length, 0);
        assert.equal(createOutputHash(timedRun.outputText), STILE_OPTIMIZE_MATH_OUTPUT_HASH);
        assert.ok(
            timedRun.ruleMilliseconds < 1000,
            `expected optimize-math-expressions runtime under 1000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
        );
    }
);

runSequentialPerformanceTest(
    "prefer-loop-invariant-expressions prunes deep invariant subtrees within the stress budget",
    async () => {
        const source = buildLoopInvariantStressBatchSource(220, 60);
        const timedRun = await lintSingleRuleWithTiming(
            "gml/prefer-loop-invariant-expressions",
            source,
            "optimized-autofix-performance.gml"
        );

        assert.equal(timedRun.messages.length, 0);
        assert.ok(
            timedRun.outputText.includes("var cached_value ="),
            "expected prefer-loop-invariant-expressions to keep hoisting loop-invariant subexpressions"
        );
        assert.ok(
            timedRun.ruleMilliseconds < 3000,
            `expected prefer-loop-invariant-expressions runtime under 3000ms, received ${timedRun.ruleMilliseconds.toFixed(2)}ms`
        );
    }
);
