/**
 * This test suite verifies that the workspace ownership and dependency policies are correctly enforced across the monorepo workspaces.
 * The tests ensure that the plugin workspace remains decoupled from the semantic and refactor packages, while the refactor workspace
 * owns the semantic-backed refactor behavior.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

type DependencyMap = Readonly<Record<string, string>>;

type PackageJson = Readonly<{
    dependencies?: DependencyMap;
}>;

const require = createRequire(import.meta.url);

function readWorkspacePackage(workspaceName: string): PackageJson {
    return require(`${workspaceName}/package.json`) as PackageJson;
}

function getDependencyVersion(packageJson: PackageJson, dependencyName: string): string | null {
    const dependencies = packageJson.dependencies ?? {};
    return dependencies[dependencyName] ?? null;
}

void describe("workspace ownership dependency policy", () => {
    void it("plugin workspace remains decoupled from semantic and refactor packages", () => {
        const pluginPackage = readWorkspacePackage("@gml-modules/plugin");

        assert.strictEqual(getDependencyVersion(pluginPackage, "@gml-modules/semantic"), null);
        assert.strictEqual(getDependencyVersion(pluginPackage, "@gml-modules/refactor"), null);
    });

    void it("refactor workspace owns semantic-backed refactor behavior", () => {
        const refactorPackage = readWorkspacePackage("@gml-modules/refactor");
        const semanticPackage = readWorkspacePackage("@gml-modules/semantic");

        assert.ok(
            getDependencyVersion(refactorPackage, "@gml-modules/semantic"),
            "Refactor workspace should declare a semantic dependency."
        );
        assert.strictEqual(
            getDependencyVersion(semanticPackage, "@gml-modules/refactor"),
            null,
            "Semantic workspace must remain analysis-only and not depend on refactor."
        );
    });
});
