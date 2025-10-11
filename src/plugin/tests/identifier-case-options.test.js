import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    IDENTIFIER_CASE_BASE_OPTION_NAME,
    IDENTIFIER_CASE_SCOPE_NAMES,
    IDENTIFIER_CASE_INHERIT_VALUE,
    IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME,
    normalizeIdentifierCaseOptions,
    getIdentifierCaseScopeOptionName,
    IDENTIFIER_CASE_IGNORE_OPTION_NAME,
    IDENTIFIER_CASE_PRESERVE_OPTION_NAME
} from "../src/options/identifier-case.js";

describe("gml identifier case option normalization", () => {
    it("defaults to disabled renaming when options are omitted", () => {
        const normalized = normalizeIdentifierCaseOptions({});

        assert.strictEqual(normalized.baseStyle, "off");
        for (const scope of IDENTIFIER_CASE_SCOPE_NAMES) {
            assert.strictEqual(
                normalized.scopeSettings[scope],
                IDENTIFIER_CASE_INHERIT_VALUE
            );
            assert.strictEqual(normalized.scopeStyles[scope], "off");
        }
        assert.deepStrictEqual(normalized.ignorePatterns, []);
        assert.deepStrictEqual(normalized.preservedIdentifiers, []);
        assert.strictEqual(normalized.assetRenamesAcknowledged, false);
    });

    it("allows scope overrides while inheriting the base style", () => {
        const normalized = normalizeIdentifierCaseOptions({
            [IDENTIFIER_CASE_BASE_OPTION_NAME]: "pascal",
            [getIdentifierCaseScopeOptionName("globals")]: "snake-upper",
            [getIdentifierCaseScopeOptionName("locals")]:
        IDENTIFIER_CASE_INHERIT_VALUE,
            [getIdentifierCaseScopeOptionName("functions")]: "camel",
            [IDENTIFIER_CASE_IGNORE_OPTION_NAME]: "temp_, debug",
            [IDENTIFIER_CASE_PRESERVE_OPTION_NAME]: ["hp", "PlayerScore"],
            [IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME]: true,
            [getIdentifierCaseScopeOptionName("assets")]: "snake-upper"
        });

        assert.strictEqual(normalized.baseStyle, "pascal");
        assert.strictEqual(normalized.scopeStyles.functions, "camel");
        assert.strictEqual(normalized.scopeStyles.globals, "snake-upper");
        assert.strictEqual(normalized.scopeStyles.locals, "pascal");
        assert.ok(normalized.ignorePatterns.includes("temp_"));
        assert.ok(normalized.ignorePatterns.includes("debug"));
        assert.deepStrictEqual(normalized.preservedIdentifiers, [
            "hp",
            "PlayerScore"
        ]);
        assert.strictEqual(normalized.assetRenamesAcknowledged, true);
    });

    it("rejects enabling asset renames without acknowledgment", () => {
        assert.throws(
            () =>
                normalizeIdentifierCaseOptions({
                    [IDENTIFIER_CASE_BASE_OPTION_NAME]: "camel",
                    [getIdentifierCaseScopeOptionName("assets")]:
            IDENTIFIER_CASE_INHERIT_VALUE
                }),
            /acknowledging asset renames/i
        );
    });

    it("allows asset renames when explicitly acknowledged", () => {
        const normalized = normalizeIdentifierCaseOptions({
            [IDENTIFIER_CASE_BASE_OPTION_NAME]: "snake-lower",
            [IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME]: true
        });

        assert.strictEqual(normalized.scopeStyles.assets, "snake-lower");
        assert.strictEqual(normalized.assetRenamesAcknowledged, true);
    });
});
