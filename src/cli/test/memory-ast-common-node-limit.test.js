import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT,
    MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR,
    applyAstCommonNodeTypeLimitEnvOverride,
    getAstCommonNodeTypeLimit,
    setAstCommonNodeTypeLimit,
    __test__
} from "../src/modules/memory/index.js";

const { collectCommonNodeTypes } = __test__;

describe("memory AST common node type limit configuration", () => {
    afterEach(() => {
        setAstCommonNodeTypeLimit(DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT);
        applyAstCommonNodeTypeLimitEnvOverride();
    });

    it("returns the baseline default when no overrides are applied", () => {
        setAstCommonNodeTypeLimit(DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT);

        assert.equal(
            getAstCommonNodeTypeLimit(),
            DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT
        );
    });

    it("allows overriding the default limit", () => {
        setAstCommonNodeTypeLimit(DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT);

        setAstCommonNodeTypeLimit(8);

        assert.equal(getAstCommonNodeTypeLimit(), 8);
    });

    it("applies environment overrides to the default limit", () => {
        setAstCommonNodeTypeLimit(DEFAULT_MEMORY_AST_COMMON_NODE_LIMIT);

        applyAstCommonNodeTypeLimitEnvOverride({
            [MEMORY_AST_COMMON_NODE_LIMIT_ENV_VAR]: "12"
        });

        assert.equal(getAstCommonNodeTypeLimit(), 12);
    });

    it("limits collected node types using the configured value", () => {
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
