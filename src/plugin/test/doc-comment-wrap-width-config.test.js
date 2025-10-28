import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH,
    DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
    DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR,
    applyDocCommentMaxWrapWidthEnvOverride,
    getDefaultDocCommentMaxWrapWidth,
    setDefaultDocCommentMaxWrapWidth
} from "../src/printer/doc-comment-wrap-width.js";

test("doc comment wrap width exposes a configurable baseline", () => {
    assert.strictEqual(
        DEFAULT_DOC_COMMENT_MAX_WRAP_WIDTH,
        DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
        "baseline constant should mirror the default configuration"
    );
    assert.strictEqual(
        getDefaultDocCommentMaxWrapWidth(),
        DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE,
        "default getter should return the baseline when no overrides apply"
    );
});

test("doc comment wrap width respects environment overrides", () => {
    const original = getDefaultDocCommentMaxWrapWidth();

    try {
        setDefaultDocCommentMaxWrapWidth(original);

        applyDocCommentMaxWrapWidthEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "72"
        });

        assert.strictEqual(
            getDefaultDocCommentMaxWrapWidth(),
            72,
            "environment override should coerce numeric strings"
        );

        applyDocCommentMaxWrapWidthEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "invalid"
        });

        assert.strictEqual(
            getDefaultDocCommentMaxWrapWidth(),
            72,
            "invalid overrides should be ignored in favour of the previous value"
        );

        applyDocCommentMaxWrapWidthEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: "Infinity"
        });

        assert.strictEqual(
            getDefaultDocCommentMaxWrapWidth(),
            Infinity,
            "infinite overrides should disable the wrap-width ceiling"
        );

        setDefaultDocCommentMaxWrapWidth(48);
        assert.strictEqual(
            getDefaultDocCommentMaxWrapWidth(),
            48,
            "imperative overrides should update the stored width"
        );
    } finally {
        setDefaultDocCommentMaxWrapWidth(DOC_COMMENT_MAX_WRAP_WIDTH_BASELINE);
        applyDocCommentMaxWrapWidthEnvOverride({
            [DOC_COMMENT_MAX_WRAP_WIDTH_ENV_VAR]: ""
        });
        setDefaultDocCommentMaxWrapWidth(original);
    }
});
