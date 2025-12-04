import assert from "node:assert/strict";
import test from "node:test";

import {
    docCommentMaxWrapWidthConfig,
    resolveDocCommentWrapWidth
} from "../../src/comments/doc-comment-service.js";

const DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE = 100;

void test("doc comment wrap width exposes a configurable baseline", () => {
    assert.strictEqual(
        docCommentMaxWrapWidthConfig.get(),
        DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
        "default getter should return the baseline when no overrides apply"
    );
});

void test("doc comment wrap width respects environment overrides", () => {
    const original = docCommentMaxWrapWidthConfig.get();

    try {
        docCommentMaxWrapWidthConfig.set(original);

        docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "72"
        });

        assert.strictEqual(
            docCommentMaxWrapWidthConfig.get(),
            72,
            "environment override should coerce numeric strings"
        );

        docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "invalid"
        });

        assert.strictEqual(
            docCommentMaxWrapWidthConfig.get(),
            72,
            "invalid overrides should be ignored in favour of the previous value"
        );

        docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "Infinity"
        });

        assert.strictEqual(
            docCommentMaxWrapWidthConfig.get(),
            Infinity,
            "infinite overrides should disable the wrap-width ceiling"
        );

        docCommentMaxWrapWidthConfig.set(48);
        assert.strictEqual(
            docCommentMaxWrapWidthConfig.get(),
            48,
            "imperative overrides should update the stored width"
        );
    } finally {
        docCommentMaxWrapWidthConfig.set(DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE);
        docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: ""
        });
        docCommentMaxWrapWidthConfig.set(original);
    }
});
