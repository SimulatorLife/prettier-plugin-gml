import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

const DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE = Infinity;

void test("doc comment wrap width exposes a configurable baseline", () => {
    assert.strictEqual(
        Core.docCommentMaxWrapWidthConfig.get(),
        DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
        "default getter should return the baseline when no overrides apply"
    );
});

void test("doc comment wrap width respects environment overrides", () => {
    const original = Core.docCommentMaxWrapWidthConfig.get();

    try {
        Core.docCommentMaxWrapWidthConfig.set(original);

        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "72"
        });

        assert.strictEqual(
            Core.docCommentMaxWrapWidthConfig.get(),
            72,
            "environment override should coerce numeric strings"
        );

        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "invalid"
        });

        assert.strictEqual(
            Core.docCommentMaxWrapWidthConfig.get(),
            72,
            "invalid overrides should be ignored in favour of the previous value"
        );

        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "Infinity"
        });

        assert.strictEqual(
            Core.docCommentMaxWrapWidthConfig.get(),
            Infinity,
            "infinite overrides should disable the wrap-width ceiling"
        );

        Core.docCommentMaxWrapWidthConfig.set(48);
        assert.strictEqual(
            Core.docCommentMaxWrapWidthConfig.get(),
            48,
            "imperative overrides should update the stored width"
        );
    } finally {
        Core.docCommentMaxWrapWidthConfig.set(
            DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE
        );
        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: ""
        });
        Core.docCommentMaxWrapWidthConfig.set(original);
    }
});
