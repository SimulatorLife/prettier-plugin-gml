import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "../../src/index.js";

function resolveLintWorkspaceRoot(): string {
    const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
    if (currentDirectory.includes(`${path.sep}dist${path.sep}`)) {
        return path.resolve(currentDirectory, "..", "..", "..");
    }

    return path.resolve(currentDirectory, "..", "..");
}

void test("lint services no longer expose project-aware analysis helpers", () => {
    const forbiddenServiceNames = [
        "createProjectAnalysisSnapshotFromProjectIndex",
        "createPrebuiltProjectAnalysisProvider",
        "createProjectLintContextRegistry",
        "createProjectSettingsFromRegistry",
        "createMissingContextSettings",
        "defaultProjectIndexExcludes",
        "resolveNearestProjectRoot",
        "resolveForcedProjectRoot"
    ];

    for (const serviceName of forbiddenServiceNames) {
        assert.equal(
            serviceName in LintWorkspace.Lint.services,
            false,
            `Lint.services must not expose ${serviceName}; project-aware analysis belongs in @gml-modules/refactor.`
        );
    }
});

void test("lint workspace retains only single-file-safe service exports", () => {
    assert.equal("featherManifest" in LintWorkspace.Lint.services, true);
    assert.equal("performanceOverrideRuleIds" in LintWorkspace.Lint.services, true);
    assert.equal("isPathWithinBoundary" in LintWorkspace.Lint.services, true);
});

void test("lint source tree no longer contains retired project-aware helper modules", () => {
    const lintWorkspaceRoot = resolveLintWorkspaceRoot();
    const retiredSourceFiles = [
        path.join(lintWorkspaceRoot, "src", "services", "project-analysis-provider.ts"),
        path.join(lintWorkspaceRoot, "src", "services", "project-root.ts"),
        path.join(lintWorkspaceRoot, "src", "types", "index.ts")
    ];

    for (const retiredSourceFile of retiredSourceFiles) {
        assert.equal(
            existsSync(retiredSourceFile),
            false,
            `Retired lint project-aware helper should not exist: ${retiredSourceFile}`
        );
    }
});

/**
 * Enforces that internal doc-comment utilities are NOT accessible through the
 * public Lint namespace. Doc-comment helpers are implementation details of the
 * lint workspace and must be imported directly from their source modules.
 *
 * See: AGENTS.md "Do NOT create re-export wrappers", target-state.md §2.1
 */
void test("Lint namespace does not expose internal doc-comment utilities", () => {
    const internalDocCommentNames = [
        "collectSyntheticDocCommentLines",
        "collectLeadingProgramLineComments",
        "extractLeadingNonDocCommentLines",
        "collectAdjacentLeadingSourceLineComments",
        "resolveDocCommentTraversalService",
        "resolveDocCommentCollectionService",
        "resolveDocCommentPresenceService",
        "resolveDocCommentDescriptionService",
        "resolveDocCommentUpdateService",
        "collectDeprecatedFunctionNames",
        "findDeprecatedDocComment",
        "buildDocumentedParamNameLookup",
        "extractDocumentedParamNames",
        "convertLegacyReturnsDescriptionLinesToMetadata"
    ];

    for (const name of internalDocCommentNames) {
        assert.equal(
            name in LintWorkspace.Lint,
            false,
            `Lint namespace must not expose internal doc-comment utility '${name}'; ` +
                `consumers must import directly from the doc-comment module.`
        );
    }
});
