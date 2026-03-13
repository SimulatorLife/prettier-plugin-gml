/**
 * This test suite verifies that the workspace ownership and dependency policies are correctly enforced across the monorepo workspaces.
 * The tests ensure that the format workspace remains decoupled from the semantic and refactor packages, while the refactor workspace 
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
    void it("format workspace remains decoupled from semantic and refactor packages", () => {
        const formatPackage = readWorkspacePackage("@gmloop/format");

        assert.strictEqual(getDependencyVersion(formatPackage, "@gmloop/semantic"), null);
        assert.strictEqual(getDependencyVersion(formatPackage, "@gmloop/refactor"), null);
        assert.strictEqual(getDependencyVersion(formatPackage, "@gmloop/fixture-runner"), "workspace:*");
    });

    void it("refactor workspace owns semantic-backed refactor behavior", () => {
        const refactorPackage = readWorkspacePackage("@gmloop/refactor");
        const semanticPackage = readWorkspacePackage("@gmloop/semantic");

        assert.ok(
            getDependencyVersion(refactorPackage, "@gmloop/semantic"),
            "Refactor workspace should declare a semantic dependency."
        );
        assert.strictEqual(
            getDependencyVersion(semanticPackage, "@gmloop/refactor"),
            null,
            "Semantic workspace must remain analysis-only and not depend on refactor."
        );
    });

    void it("fixture-runner depends only on core among local workspaces", () => {
        const fixtureRunnerPackage = readWorkspacePackage("@gmloop/fixture-runner");

        assert.strictEqual(getDependencyVersion(fixtureRunnerPackage, "@gmloop/core"), "workspace:*");
        assert.strictEqual(getDependencyVersion(fixtureRunnerPackage, "@gmloop/format"), null);
        assert.strictEqual(getDependencyVersion(fixtureRunnerPackage, "@gmloop/lint"), null);
        assert.strictEqual(getDependencyVersion(fixtureRunnerPackage, "@gmloop/refactor"), null);
        assert.strictEqual(getDependencyVersion(fixtureRunnerPackage, "@gmloop/semantic"), null);
    });
});
