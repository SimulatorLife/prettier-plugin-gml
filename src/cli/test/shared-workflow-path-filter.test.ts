import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { createWorkflowPathFilter, ensureManualWorkflowArtifactsAllowed } from "../src/workflow/path-filter.js";

void describe("workflow path filter helpers", () => {
    void it("allows paths that satisfy the workflow filters", () => {
        const workspace = path.resolve("/tmp", "workflow-path-filter", "allowed");
        const outputPath = path.join(workspace, "artefacts", "manual.json");
        const filter = createWorkflowPathFilter({ allowPaths: [workspace] });

        assert.doesNotThrow(() => {
            ensureManualWorkflowArtifactsAllowed(filter, {
                cacheRoot: workspace,
                outputPath
            });
        });
    });

    void it("allows any path when no allow list is provided", () => {
        const workspace = path.resolve("/tmp", "workflow-path-filter", "open");
        const filter = createWorkflowPathFilter();

        assert.equal(filter.allowList.length, 0);
        assert.equal(filter.denyList.length, 0);
        assert.ok(filter.allowsDirectory(workspace));
        assert.ok(filter.allowsPath(path.join(workspace, "file.json")));
    });

    void it("rejects directories outside the workflow filters", () => {
        const root = path.resolve("/tmp", "workflow-path-filter", "root");
        const allowed = path.join(root, "allowed");
        const denied = path.join(root, "denied");
        const filter = createWorkflowPathFilter({
            allowPaths: [allowed],
            denyPaths: [denied]
        });

        assert.throws(
            () => {
                ensureManualWorkflowArtifactsAllowed(filter, {
                    cacheRoot: denied
                });
            },
            (error) =>
                error instanceof Error && /Manual cache root/.test(error.message) && error.message.includes(denied)
        );
    });

    void it("rejects files outside the workflow filters", () => {
        const restricted = path.resolve("/tmp", "workflow-path-filter", "restricted");
        const filter = createWorkflowPathFilter({ denyPaths: [restricted] });

        assert.throws(
            () => {
                ensureManualWorkflowArtifactsAllowed(filter, {
                    outputPath: path.join(restricted, "manual.json")
                });
            },
            (error) =>
                error instanceof Error && /Manual output path/.test(error.message) && error.message.includes(restricted)
        );
    });
});
