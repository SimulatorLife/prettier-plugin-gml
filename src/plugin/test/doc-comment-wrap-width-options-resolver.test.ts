import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import { Core } from "@gml-modules/core";

import { resolveDocCommentPrinterOptions } from "../src/printer/doc-comment-options.js";

const DOC_COMMENT_WRAP_WIDTH_ENV_VAR =
    "PRETTIER_PLUGIN_GML_DOC_COMMENT_MAX_WRAP_WIDTH";

void describe("resolveDocCommentPrinterOptions", () => {
    const originalWidth = Core.docCommentMaxWrapWidthConfig.get();

    beforeEach(() => {
        Core.docCommentMaxWrapWidthConfig.set(originalWidth);
        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: ""
        });
    });

    after(() => {
        Core.docCommentMaxWrapWidthConfig.set(originalWidth);
        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: ""
        });
    });

    void it("uses the core wrap width config when the printer options omit a width", () => {
        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: "72"
        });

        const resolved = resolveDocCommentPrinterOptions({});

        assert.equal(resolved.docCommentMaxWrapWidth, 72);
    });

    void it("prefers explicit printer option values over configured widths", () => {
        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: "72"
        });

        const resolved = resolveDocCommentPrinterOptions({
            docCommentMaxWrapWidth: 64
        });

        assert.equal(resolved.docCommentMaxWrapWidth, 64);
    });

    void it("passes through explicit Infinity values to disable wrapping", () => {
        Core.docCommentMaxWrapWidthConfig.applyEnvOverride({
            [DOC_COMMENT_WRAP_WIDTH_ENV_VAR]: "72"
        });

        const resolved = resolveDocCommentPrinterOptions({
            docCommentMaxWrapWidth: Infinity
        });

        assert.equal(resolved.docCommentMaxWrapWidth, Infinity);
    });
});
