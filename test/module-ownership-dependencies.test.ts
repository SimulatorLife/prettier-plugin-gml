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
        const formatPackage = readWorkspacePackage("@gml-modules/format");

        assert.strictEqual(getDependencyVersion(formatPackage, "@gml-modules/semantic"), null);
        assert.strictEqual(getDependencyVersion(formatPackage, "@gml-modules/refactor"), null);
    });

    void it("format workspace does not depend on lint (semantic content rewrites belong in @gml-modules/lint, not the formatter)", () => {
        // The formatter boundary (target-state.md §2.1, §3.2) forbids semantic/content
        // rewrites inside @gml-modules/format. Removing this dependency prevents
        // accidental re-introduction of lint-owned logic (e.g. argumentN renaming,
        // redundant alias filtering) into the formatter's source tree.
        const formatPackage = readWorkspacePackage("@gml-modules/format");

        assert.strictEqual(
            getDependencyVersion(formatPackage, "@gml-modules/lint"),
            null,
            "Format workspace must not depend on @gml-modules/lint — semantic/content rewrites belong in the lint workspace."
        );
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
