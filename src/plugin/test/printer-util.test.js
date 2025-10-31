import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DefineReplacementDirective,
    getNormalizedDefineReplacementDirective
} from "../src/printer/util.js";

describe("printer util define replacement directive normalization", () => {
    it("normalizes recognized directives case-insensitively", () => {
        const regionNode = {
            type: "DefineStatement",
            replacementDirective: "#REGION"
        };
        const macroNode = {
            type: "DefineStatement",
            replacementDirective: "  #MACRO  "
        };

        assert.equal(
            getNormalizedDefineReplacementDirective(regionNode),
            DefineReplacementDirective.REGION
        );
        assert.equal(
            getNormalizedDefineReplacementDirective(macroNode),
            DefineReplacementDirective.MACRO
        );
    });

    it("returns null when a define statement lacks a directive", () => {
        assert.equal(getNormalizedDefineReplacementDirective(null), null);
        assert.equal(
            getNormalizedDefineReplacementDirective({
                type: "DefineStatement"
            }),
            null
        );
        assert.equal(
            getNormalizedDefineReplacementDirective({
                type: "DefineStatement",
                replacementDirective: "   "
            }),
            null
        );
    });

    it("throws when the directive string is unsupported", () => {
        assert.throws(
            () =>
                getNormalizedDefineReplacementDirective({
                    type: "DefineStatement",
                    replacementDirective: "#unknown"
                }),
            (error) =>
                error instanceof RangeError && /#unknown/.test(error.message)
        );
    });
});
