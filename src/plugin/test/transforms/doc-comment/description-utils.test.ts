import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DescriptionUtils } from "../../../src/transforms/doc-comment/index.js";

void describe("Description continuation classification", () => {
    void it("stops when the line is not a doc-comment continuation", () => {
        const nonString = DescriptionUtils.classifyDescriptionContinuationLine(42);
        assert.deepEqual(nonString, { kind: "stop" });

        const nonDocLine = DescriptionUtils.classifyDescriptionContinuationLine("// not a doc comment");
        assert.deepEqual(nonDocLine, { kind: "stop" });

        const tagLine = DescriptionUtils.classifyDescriptionContinuationLine("/// @param foo");
        assert.deepEqual(tagLine, { kind: "stop" });
    });

    void it("classifies empty and text continuations", () => {
        const emptyLine = DescriptionUtils.classifyDescriptionContinuationLine("///   ");
        assert.equal(emptyLine.kind, "empty");
        if (emptyLine.kind === "empty") {
            assert.equal(emptyLine.trimmedLine, "///");
        }

        const textLine = DescriptionUtils.classifyDescriptionContinuationLine("/// extra details");
        assert.equal(textLine.kind, "text");
        if (textLine.kind === "text") {
            assert.equal(textLine.suffix, "extra details");
            assert.equal(textLine.trimmedLine, "/// extra details");
            assert.equal(textLine.originalLine, "/// extra details");
        }
    });
});
