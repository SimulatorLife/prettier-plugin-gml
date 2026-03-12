import assert from "node:assert/strict";
import { test } from "node:test";

import * as CoreWorkspace from "@gmloop/core";
import * as LintWorkspace from "@gmloop/lint";
import { ESLint } from "eslint";

import { clearDeprecatedIdentifierCatalogCache } from "../../src/services/deprecated-identifiers/index.js";

function resetDeprecatedMetadataState(): void {
    CoreWorkspace.Core.resetReservedIdentifierMetadataLoader();
    CoreWorkspace.Core.clearIdentifierMetadataCache();
    clearDeprecatedIdentifierCatalogCache();
}

test.afterEach(() => {
    resetDeprecatedMetadataState();
});

function createMutableRecommendedConfig(): Array<Record<string, unknown>> {
    return LintWorkspace.Lint.configs.recommended.map((config) => ({
        ...config,
        files: [...config.files],
        plugins: config.plugins ? { ...config.plugins } : undefined,
        rules: { ...config.rules }
    }));
}

void test("recommended config auto-fixes simplify-real-calls and no-legacy-api together", async () => {
    CoreWorkspace.Core.setReservedIdentifierMetadataLoader(() => ({
        identifiers: {
            array_length_2d: {
                type: "function",
                deprecated: true,
                replacement: "array_length",
                replacementKind: "direct-rename",
                legacyUsage: "call",
                diagnosticOwner: "gml"
            }
        }
    }));
    clearDeprecatedIdentifierCatalogCache();

    const sourceText = ['var total = real("5");', "var count = array_length_2d(items);", ""].join("\n");
    const recommendedConfig = createMutableRecommendedConfig();

    const eslint = new ESLint({
        overrideConfigFile: true,
        fix: true,
        overrideConfig: recommendedConfig
    });

    const [result] = await eslint.lintText(sourceText, {
        filePath: "recommended-config-autofix.gml"
    });

    assert.equal(result.output, ["var total = 5;", "var count = array_length(items);", ""].join("\n"));
    assert.equal(result.messages.length, 0);
});

void test("recommended config auto-fixes prefer-array-push and prefer-increment-decrement-operators together", async () => {
    const sourceText = [
        "var items = [];",
        "var total = 0;",
        "items[array_length(items)] = total;",
        "total += 1;",
        "self.hp -= 1;",
        ""
    ].join("\n");

    const eslint = new ESLint({
        overrideConfigFile: true,
        fix: true,
        overrideConfig: createMutableRecommendedConfig()
    });

    const [result] = await eslint.lintText(sourceText, {
        filePath: "recommended-config-autofix.gml"
    });

    assert.equal(
        result.output,
        ["var items = [];", "var total = 0;", "array_push(items, total);", "total++;", "self.hp--;", ""].join("\n")
    );
    assert.equal(result.messages.length, 0);
});
