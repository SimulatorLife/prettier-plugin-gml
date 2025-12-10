import assert from "node:assert/strict";

import { Core } from "@gml-modules/core";

import { resolveDocCommentPrinterOptions } from "../src/printer/doc-comment/index.js";

const DOC_COMMENT_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";
const originalWidth = Core.docCommentMaxWrapWidthConfig.get();

function resetDocCommentWrapWidth() {
    Core.docCommentMaxWrapWidthConfig.set(originalWidth);
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
        [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: ""
    });
}

const { after, beforeEach, test } = await import("node:test");

beforeEach(() => {
    resetDocCommentWrapWidth();
});

after(() => {
    resetDocCommentWrapWidth();
});

test("resolveDocCommentPrinterOptions uses core config when no width provided", () => {
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
        [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: "72"
    });

    const resolved = resolveDocCommentPrinterOptions({});

    assert.equal(resolved.docCommentMaxWrapWidth, 72);
});

test("resolveDocCommentPrinterOptions respects explicit option values", () => {
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
        [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: "72"
    });

    const resolved = resolveDocCommentPrinterOptions({
        docCommentMaxWrapWidth: 64
    });

    assert.equal(resolved.docCommentMaxWrapWidth, 64);
});

test("resolveDocCommentPrinterOptions allows Infinity to disable wrapping", () => {
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
        [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: "72"
    });

    const resolved = resolveDocCommentPrinterOptions({
        docCommentMaxWrapWidth: Infinity
    });

    assert.equal(resolved.docCommentMaxWrapWidth, Infinity);
});
