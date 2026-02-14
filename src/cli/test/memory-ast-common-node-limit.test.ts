import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    __test__,
    applyAstCommonNodeTypeLimitEnvOverride,
    DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT,
    getAstCommonNodeTypeLimit,
    MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR,
    setAstCommonNodeTypeLimit
} from "../src/commands/memory.js";
import { buildEnvConfiguredValueTests } from "./helpers/env-configured-value-test-builder.js";

const { collectCommonNodeTypes } = __test__;

void describe("memory AST common node type limit configuration", () => {
    buildEnvConfiguredValueTests({
        description: "limit",
        defaultValue: DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT,
        envVar: MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR,
        getValue: getAstCommonNodeTypeLimit,
        setValue: setAstCommonNodeTypeLimit,
        applyEnvOverride: applyAstCommonNodeTypeLimitEnvOverride,
        testOverrideValue: 12,
        testOverrideEnvString: "12"
    });

    afterEach(() => {
        applyAstCommonNodeTypeLimitEnvOverride();
    });

    void it("limits collected node types using the configured value", () => {
        setAstCommonNodeTypeLimit(2);

        const typeCounts = new Map([
            ["Assignment", 5],
            ["Call", 3],
            ["Return", 1]
        ]);

        const result = collectCommonNodeTypes(typeCounts);

        assert.deepEqual(result, [
            { type: "Assignment", count: 5 },
            { type: "Call", count: 3 }
        ]);
    });
});
