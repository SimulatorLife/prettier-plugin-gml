import assert from "node:assert/strict";
import test from "node:test";

import {
    applyIdentifierCasePlanSnapshot,
    captureIdentifierCasePlanSnapshot,
    getIdentifierCaseRenameForNode,
    prepareIdentifierCasePlan,
    registerIdentifierCasePlanPreparationProvider,
    registerIdentifierCasePlanSnapshotProvider,
    registerIdentifierCaseRenameLookupProvider,
    resetIdentifierCasePlanServiceProvider,
    resolveIdentifierCasePlanPreparationService,
    resolveIdentifierCasePlanSnapshotService,
    resolveIdentifierCaseRenameLookupService
} from "../src/identifier-case/plan-service.js";

test(
    "identifier case plan services expose segregated contracts",
    { concurrency: false },
    () => {
        resetIdentifierCasePlanServiceProvider();
        const preparation = resolveIdentifierCasePlanPreparationService();
        const renameLookup = resolveIdentifierCaseRenameLookupService();
        const snapshot = resolveIdentifierCasePlanSnapshotService();

        assert.ok(
            Object.isFrozen(preparation),
            "preparation service should be frozen"
        );
        assert.deepStrictEqual(
            Object.keys(preparation),
            ["prepareIdentifierCasePlan"],
            "preparation service should only expose plan preparation"
        );

        assert.ok(
            Object.isFrozen(renameLookup),
            "rename lookup service should be frozen"
        );
        assert.deepStrictEqual(
            Object.keys(renameLookup),
            ["getIdentifierCaseRenameForNode"],
            "rename lookup service should only expose rename lookups"
        );

        assert.ok(
            Object.isFrozen(snapshot),
            "snapshot service should be frozen"
        );
        assert.deepStrictEqual(
            Object.keys(snapshot),
            [
                "captureIdentifierCasePlanSnapshot",
                "applyIdentifierCasePlanSnapshot"
            ],
            "snapshot service should only expose capture and apply helpers"
        );

        resetIdentifierCasePlanServiceProvider();
    }
);

test(
    "identifier case plan helpers delegate through segregated services",
    { concurrency: false },
    async () => {
        const calls = [];

        const defaultPreparation =
            resolveIdentifierCasePlanPreparationService();
        const defaultRenameLookup = resolveIdentifierCaseRenameLookupService();
        const defaultSnapshot = resolveIdentifierCasePlanSnapshotService();

        registerIdentifierCasePlanPreparationProvider(() => ({
            async prepareIdentifierCasePlan(options) {
                calls.push({ type: "prepare", options });
                return defaultPreparation.prepareIdentifierCasePlan(options);
            }
        }));

        registerIdentifierCaseRenameLookupProvider(() => ({
            getIdentifierCaseRenameForNode(node, options) {
                calls.push({ type: "rename", node, options });
                return defaultRenameLookup.getIdentifierCaseRenameForNode(
                    node,
                    options
                );
            }
        }));

        registerIdentifierCasePlanSnapshotProvider(() => ({
            captureIdentifierCasePlanSnapshot(options) {
                calls.push({ type: "capture", options });
                return defaultSnapshot.captureIdentifierCasePlanSnapshot(
                    options
                );
            },
            applyIdentifierCasePlanSnapshot(snapshot, options) {
                calls.push({ type: "apply", snapshot, options });
                defaultSnapshot.applyIdentifierCasePlanSnapshot(
                    snapshot,
                    options
                );
            }
        }));

        try {
            await prepareIdentifierCasePlan({ flag: "prepare" });
            getIdentifierCaseRenameForNode(
                { type: "Identifier", name: "value" },
                { flag: "rename" }
            );

            const snapshot = captureIdentifierCasePlanSnapshot({
                flag: "capture"
            });

            applyIdentifierCasePlanSnapshot(snapshot, { flag: "apply" });

            assert.deepStrictEqual(
                calls.map((entry) => entry.type),
                ["prepare", "rename", "capture", "apply"]
            );
            assert.strictEqual(calls[0].options.flag, "prepare");
            assert.deepStrictEqual(calls[1].node, {
                type: "Identifier",
                name: "value"
            });
            assert.strictEqual(calls[1].options.flag, "rename");
            assert.strictEqual(calls[2].options.flag, "capture");
            assert.strictEqual(calls[3].snapshot, snapshot);
            assert.strictEqual(calls[3].options.flag, "apply");
        } finally {
            resetIdentifierCasePlanServiceProvider();
        }
    }
);
