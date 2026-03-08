import assert from "node:assert/strict";
import { test } from "node:test";

import * as LintWorkspace from "../../src/index.js";

void test("lint services no longer expose project-aware analysis helpers", () => {
    const forbiddenServiceNames = [
        "createProjectAnalysisSnapshotFromProjectIndex",
        "createPrebuiltProjectAnalysisProvider",
        "createProjectLintContextRegistry",
        "createProjectSettingsFromRegistry",
        "createMissingContextSettings",
        "defaultProjectIndexExcludes"
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
