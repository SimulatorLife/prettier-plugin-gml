import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeIdentifierCaseOptions } from "../src/options/identifier-case.js";

describe("normalizeIdentifierCaseOptions", () => {
    it("returns no-op defaults when no options are provided", () => {
        const normalized = normalizeIdentifierCaseOptions({});

        assert.deepStrictEqual(normalized.baseCase, "off");
        assert.deepStrictEqual(normalized.scopes, {
            functions: "off",
            structs: "off",
            locals: "off",
            instance: "off",
            globals: "off",
            assets: "off",
            macros: "off"
        });
        assert.deepStrictEqual(normalized.ignorePatterns, []);
        assert.deepStrictEqual(normalized.preservedIdentifiers, []);
        assert.strictEqual(normalized.acknowledgesAssetUpdates, false);
    });

    it("honours per-scope overrides when provided", () => {
        const normalized = normalizeIdentifierCaseOptions({
            gmlIdentifierCase: "pascal",
            gmlIdentifierCaseFunctions: "inherit",
            gmlIdentifierCaseLocals: "snake-lower",
            gmlIdentifierCaseGlobals: "snake-upper",
            gmlIdentifierCaseInstance: "camel",
            gmlIdentifierCaseAssets: "pascal",
            gmlIdentifierCaseMacros: "off",
            gmlIdentifierCaseIgnore: "foo_bar , baz",
            gmlIdentifierCasePreserve: "PlayerHP, enemyHP",
            gmlIdentifierCaseAcknowledgeAssetUpdates: true
        });

        assert.deepStrictEqual(normalized.baseCase, "pascal");
        assert.deepStrictEqual(normalized.scopes, {
            functions: "pascal",
            structs: "pascal",
            locals: "snake-lower",
            instance: "camel",
            globals: "snake-upper",
            assets: "pascal",
            macros: "off"
        });
        assert.deepStrictEqual(normalized.ignorePatterns, ["foo_bar", "baz"]);
        assert.deepStrictEqual(normalized.preservedIdentifiers, [
            "PlayerHP",
            "enemyHP"
        ]);
        assert.strictEqual(normalized.acknowledgesAssetUpdates, true);
    });

    it("requires explicit acknowledgement before enabling asset renames", () => {
        assert.throws(() => {
            normalizeIdentifierCaseOptions({
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseAssets: "inherit"
            });
        }, /AcknowledgeAssetUpdates/);

        assert.doesNotThrow(() => {
            normalizeIdentifierCaseOptions({
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseAssets: "inherit",
                gmlIdentifierCaseAcknowledgeAssetUpdates: true
            });
        });
    });
});
