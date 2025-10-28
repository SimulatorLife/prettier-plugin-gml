import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
    createWorkflowPathFilter,
    ensureWorkflowPathsAllowed
} from "../src/shared/workflow/path-filter.js";

describe("workflow path filter helpers", () => {
    it("allows paths that satisfy the workflow filters", () => {
        const workspace = path.resolve(
            "/tmp",
            "workflow-path-filter",
            "allowed"
        );
        const outputPath = path.join(workspace, "artefacts", "manual.json");
        const filter = createWorkflowPathFilter({ allowPaths: [workspace] });

        assert.doesNotThrow(() => {
            ensureWorkflowPathsAllowed(filter, [
                {
                    type: "directory",
                    target: workspace,
                    label: "Manual cache root"
                },
                {
                    type: "path",
                    target: outputPath,
                    label: "Manual output path"
                }
            ]);
        });
    });

    it("rejects directories outside the workflow filters", () => {
        const root = path.resolve("/tmp", "workflow-path-filter", "root");
        const allowed = path.join(root, "allowed");
        const denied = path.join(root, "denied");
        const filter = createWorkflowPathFilter({
            allowPaths: [allowed],
            denyPaths: [denied]
        });

        assert.throws(
            () => {
                ensureWorkflowPathsAllowed(filter, [
                    {
                        type: "directory",
                        target: denied,
                        label: "Manual cache root"
                    }
                ]);
            },
            (error) =>
                error instanceof Error &&
                /Manual cache root/.test(error.message) &&
                error.message.includes(denied)
        );
    });

    it("rejects files outside the workflow filters", () => {
        const workspace = path.resolve(
            "/tmp",
            "workflow-path-filter",
            "workspace"
        );
        const outputPath = path.join(workspace, "results", "manual.json");
        const restricted = path.resolve(
            "/tmp",
            "workflow-path-filter",
            "restricted"
        );
        const filter = createWorkflowPathFilter({ denyPaths: [restricted] });

        assert.throws(
            () => {
                ensureWorkflowPathsAllowed(filter, [
                    {
                        type: "path",
                        target: path.join(restricted, "manual.json"),
                        label: "Manual output path"
                    },
                    {
                        type: "path",
                        target: outputPath,
                        label: "Manual output path"
                    }
                ]);
            },
            (error) =>
                error instanceof Error &&
                /Manual output path/.test(error.message) &&
                error.message.includes(restricted)
        );
    });
});
