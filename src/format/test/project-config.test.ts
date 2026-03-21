import assert from "node:assert/strict";
import test from "node:test";

import { Format } from "../index.js";

void test("extractProjectFormatOptions removes non-formatter config sections", () => {
    const options = Format.extractProjectFormatOptions({
        printWidth: 95,
        singleQuote: false,
        lintRules: {
            "gml/no-globalvar": "error"
        },
        refactor: {
            codemods: {
                namingConvention: {}
            }
        },
        fixture: {
            kind: "format"
        }
    });

    assert.deepEqual(options, {
        printWidth: 95,
        singleQuote: false
    });
});

void test("extractProjectFormatOptions does not infer formatter options from lint rules", () => {
    const options = Format.extractProjectFormatOptions({
        printWidth: 100,
        lintRules: {
            "gml/normalize-operator-aliases": "error"
        }
    });

    assert.deepEqual(options, {
        printWidth: 100
    });
});

void test("extractProjectFormatOptions preserves explicit logicalOperatorsStyle alongside lint config", () => {
    const options = Format.extractProjectFormatOptions({
        printWidth: 100,
        logicalOperatorsStyle: "keywords",
        lintRules: {
            "gml/normalize-operator-aliases": "error"
        }
    });

    assert.deepEqual(options, {
        printWidth: 100,
        logicalOperatorsStyle: "keywords"
    });
});

void test("extractProjectFormatOptions drops project-aware and unknown top-level sections by default", () => {
    const options = Format.extractProjectFormatOptions({
        printWidth: 88,
        useTabs: true,
        semantic: {
            index: "sqlite"
        },
        transpiler: {
            hotReload: true
        },
        runtimeWrapper: {
            inject: true
        },
        watch: {
            debounceMs: 50
        },
        customWorkspace: {
            enabled: true
        }
    });

    assert.deepEqual(options, {
        printWidth: 88,
        useTabs: true
    });
});
