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

void test("extractProjectFormatOptions defaults logicalOperatorsStyle to symbols when normalize-operator-aliases is enabled", () => {
    const options = Format.extractProjectFormatOptions({
        printWidth: 100,
        lintRules: {
            "gml/normalize-operator-aliases": "error"
        }
    });

    assert.deepEqual(options, {
        printWidth: 100,
        logicalOperatorsStyle: "symbols"
    });
});

void test("extractProjectFormatOptions preserves explicit logicalOperatorsStyle even when normalize-operator-aliases is enabled", () => {
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
