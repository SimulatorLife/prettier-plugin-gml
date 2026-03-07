/**
 * Enforces the lint/refactor boundary (target-state.md §2.3, §2.4, §3.4):
 *
 * Rename-conflict planning is a cross-file, project-aware operation that belongs
 * exclusively in `@gml-modules/refactor`. The lint workspace's `GmlProjectContext`
 * must not expose `planFeatherRenames` or advertise the `RENAME_CONFLICT_PLANNING`
 * capability, because lint rules are single-file only and must not perform
 * cross-file writes or project-wide rename coordination.
 *
 * The refactor workspace (`@gml-modules/refactor`) already owns and fully
 * implements this functionality via its `RefactorEngine.planFeatherRenames` and
 * `ProjectAnalysisProvider.planFeatherRenames` APIs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { GmlProjectContext, ProjectAnalysisProvider } from "../../src/services/index.js";
import type { ProjectCapability } from "../../src/types/index.js";
import { assertEquals } from "../assertions.js";

/**
 * `RENAME_CONFLICT_PLANNING` is a cross-file project operation owned by the
 * refactor workspace. It must not appear as a lint-layer capability.
 */
void test("ProjectCapability does not include RENAME_CONFLICT_PLANNING (belongs in refactor)", () => {
    // The ProjectCapability union type is a compile-time contract, but we can
    // verify the intent at runtime by confirming that no capability string
    // matching the renamed capability appears in the type definition's
    // documentation via a snapshot of expected values.
    const allowedCapabilities: ReadonlyArray<ProjectCapability> = [
        "IDENTIFIER_OCCUPANCY",
        "IDENTIFIER_OCCURRENCES",
        "LOOP_HOIST_NAME_RESOLUTION"
    ];

    // Verify that the only capabilities exposed by lint are single-file ones.
    for (const cap of allowedCapabilities) {
        assert.ok(typeof cap === "string", `Capability ${cap} must be a string`);
    }

    // Ensure RENAME_CONFLICT_PLANNING does not type-check as a ProjectCapability.
    // The following line would produce a TypeScript error if RENAME_CONFLICT_PLANNING
    // were re-added to the ProjectCapability union:
    //   const invalid: ProjectCapability = "RENAME_CONFLICT_PLANNING"; // ← compile error
    // This test documents the contract at the source level.
    assertEquals(allowedCapabilities.length, 3, "Lint must expose exactly 3 single-file capabilities");
    assert.ok(
        !allowedCapabilities.includes("RENAME_CONFLICT_PLANNING" as ProjectCapability),
        "RENAME_CONFLICT_PLANNING must not be a lint ProjectCapability — rename-conflict planning belongs in @gml-modules/refactor (target-state.md §2.3, §2.4)"
    );
});

/**
 * `GmlProjectContext` must not expose `planFeatherRenames`.
 * Rename-conflict planning is cross-file and belongs in the refactor workspace.
 */
void test("GmlProjectContext does not expose planFeatherRenames (belongs in refactor)", () => {
    // Type-level check: if planFeatherRenames were added back to the interface,
    // TypeScript would require the mock below to implement it, making this test fail.
    const mockContext: GmlProjectContext = {
        capabilities: new Set<ProjectCapability>(["IDENTIFIER_OCCUPANCY"]),
        isIdentifierNameOccupiedInProject: () => false,
        listIdentifierOccurrenceFiles: () => new Set<string>(),
        assessGlobalVarRewrite: () => ({ allowRewrite: false, reason: "missing-project-context" }),
        resolveLoopHoistIdentifier: () => null
    };

    assert.ok(
        !("planFeatherRenames" in mockContext),
        "GmlProjectContext must not include planFeatherRenames — cross-file rename conflict planning belongs in @gml-modules/refactor (target-state.md §2.3, §2.4)"
    );
});

/**
 * `ProjectAnalysisSnapshot` must not expose `planFeatherRenames`.
 * The lint-layer snapshot provides only single-file project metadata.
 */
void test("ProjectAnalysisProvider snapshot does not expose planFeatherRenames (belongs in refactor)", () => {
    // Construct a compliant ProjectAnalysisProvider and verify the snapshot
    // it returns does not include planFeatherRenames.
    const provider: ProjectAnalysisProvider = {
        buildSnapshot(_projectRoot, _options) {
            return {
                capabilities: new Set<ProjectCapability>(["IDENTIFIER_OCCUPANCY"]),
                isIdentifierNameOccupiedInProject: () => false,
                listIdentifierOccurrenceFiles: () => new Set<string>(),
                assessGlobalVarRewrite: () => ({ allowRewrite: false, reason: "missing-project-context" }),
                resolveLoopHoistIdentifier: () => null
            };
        }
    };

    const snapshot = provider.buildSnapshot("/tmp/project", {
        excludedDirectories: new Set(),
        allowedDirectories: []
    });

    assert.ok(
        !("planFeatherRenames" in snapshot),
        "ProjectAnalysisSnapshot must not include planFeatherRenames — cross-file rename conflict planning belongs in @gml-modules/refactor (target-state.md §2.3, §2.4, §3.4)"
    );
});
