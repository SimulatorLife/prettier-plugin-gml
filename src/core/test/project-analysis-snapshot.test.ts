import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "../index.js";

function createFixtureSnapshot() {
    return Core.createProjectAnalysisSnapshotFromIndex(
        new Map<string, ReadonlySet<string>>([
            ["player_score", new Set(["/project/scripts/player.gml", "/project/scripts/hud.gml"])],
            ["len", new Set(["/project/scripts/loop.gml"])],
            ["existing_name", new Set(["/project/scripts/rename.gml"])]
        ])
    );
}

void test("project analysis snapshot reports identifier occupancy", () => {
    const snapshot = createFixtureSnapshot();

    assert.equal(snapshot.isIdentifierNameOccupiedInProject("PLAYER_SCORE"), true);
    assert.equal(snapshot.isIdentifierNameOccupiedInProject("missing_symbol"), false);
});

void test("project analysis snapshot lists identifier occurrence files", () => {
    const snapshot = createFixtureSnapshot();

    assert.deepEqual(
        snapshot.listIdentifierOccurrenceFiles("player_score"),
        new Set(["/project/scripts/player.gml", "/project/scripts/hud.gml"])
    );
    assert.deepEqual(snapshot.listIdentifierOccurrenceFiles("unknown"), new Set());
});

void test("project analysis snapshot computes rename-collision plan", () => {
    const snapshot = createFixtureSnapshot();

    assert.deepEqual(
        snapshot.planIdentifierRenames([
            { identifierName: "alpha", preferredReplacementName: "alpha" },
            { identifierName: "beta", preferredReplacementName: "existing_name" },
            { identifierName: "gamma", preferredReplacementName: "fresh_name" }
        ]),
        [
            {
                identifierName: "alpha",
                preferredReplacementName: "alpha",
                safe: false,
                reason: "no-op-rename"
            },
            {
                identifierName: "beta",
                preferredReplacementName: "existing_name",
                safe: false,
                reason: "name-collision"
            },
            {
                identifierName: "gamma",
                preferredReplacementName: "fresh_name",
                safe: true,
                reason: null
            }
        ]
    );
});

void test("project analysis snapshot resolves loop-hoist identifiers", () => {
    const snapshot = createFixtureSnapshot();

    assert.equal(snapshot.resolveLoopHoistIdentifier("i", new Set(["i", "i_1"])), "i_2");
    assert.equal(snapshot.resolveLoopHoistIdentifier("len", new Set()), "len_1");
});

void test("project analysis snapshot assesses globalvar rewrite safety", () => {
    const snapshot = createFixtureSnapshot();

    assert.deepEqual(snapshot.assessGlobalVarRewrite("/project/scripts/a.gml", true), {
        allowRewrite: true,
        reason: null
    });
    assert.deepEqual(snapshot.assessGlobalVarRewrite(null, true), {
        allowRewrite: false,
        reason: "missing-file-path"
    });
    assert.deepEqual(snapshot.assessGlobalVarRewrite(null, false), {
        allowRewrite: true,
        reason: null
    });
});

void test("project analysis snapshot is deterministic across repeated calls", () => {
    const snapshot = createFixtureSnapshot();
    const requests = [{ identifierName: "delta", preferredReplacementName: "existing_name" }];

    const firstPlan = snapshot.planIdentifierRenames(requests);
    const secondPlan = snapshot.planIdentifierRenames(requests);

    assert.deepEqual(firstPlan, secondPlan);
    assert.deepEqual(
        snapshot.listIdentifierOccurrenceFiles("player_score"),
        snapshot.listIdentifierOccurrenceFiles("player_score")
    );
    assert.equal(
        snapshot.resolveLoopHoistIdentifier("len", new Set()),
        snapshot.resolveLoopHoistIdentifier("len", new Set())
    );
});
