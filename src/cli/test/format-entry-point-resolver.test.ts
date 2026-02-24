import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    resolveFormatEntryPoint as resolveCliFormatEntryPoint,
    resolveFormatEntryPoint
} from "../src/format-runtime/entry-point.js";

void describe("resolveCliFormatEntryPoint", () => {
    void it("delegates to the default format entry resolver", () => {
        const resolved = resolveCliFormatEntryPoint();
        const expected = resolveFormatEntryPoint();

        assert.equal(resolved, expected);
    });

    void it("forwards options to the underlying resolver", () => {
        const env = {
            PRETTIER_PLUGIN_GML_FORMAT_PATH: "./src/format/src/format-entry.js"
        };

        const resolved = resolveCliFormatEntryPoint({ env });
        const expected = resolveFormatEntryPoint({ env });

        assert.equal(resolved, expected);
    });
});
