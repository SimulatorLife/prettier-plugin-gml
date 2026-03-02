import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

/**
 * Tests for `ScopeTracker.getFilePathsDeclaringSymbol`.
 *
 * The method is the declaration-side counterpart to
 * `getFilePathsReferencingSymbol` and is used by hot-reload pipelines to
 * identify which source files must be re-analysed when a symbol's definition
 * needs refreshing.
 */
void describe("ScopeTracker.getFilePathsDeclaringSymbol", () => {
    void it("returns empty set for null or undefined name", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/project/foo.gml" });
        tracker.declare("x", { name: "x" });

        assert.equal(tracker.getFilePathsDeclaringSymbol(null).size, 0);
        assert.equal(tracker.getFilePathsDeclaringSymbol(undefined).size, 0);
    });

    void it("returns empty set when tracker is disabled", () => {
        const tracker = new ScopeTracker({ enabled: false });

        assert.equal(tracker.getFilePathsDeclaringSymbol("x").size, 0);
    });

    void it("returns empty set for an unknown symbol", () => {
        const tracker = new ScopeTracker({ enabled: true });
        tracker.enterScope("program", { path: "/project/foo.gml" });
        tracker.declare("y", { name: "y" });

        assert.equal(tracker.getFilePathsDeclaringSymbol("unknown").size, 0);
    });

    void it("returns the path of the scope that declares the symbol", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("file", { path: "/project/scripts/helper.gml" });
        tracker.declare("helperFn", { name: "helperFn" });
        tracker.exitScope();

        const paths = tracker.getFilePathsDeclaringSymbol("helperFn");

        assert.equal(paths.size, 1);
        assert.ok(paths.has("/project/scripts/helper.gml"));
    });

    void it("does not include files that only reference the symbol", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // File that declares the symbol
        tracker.enterScope("file", { path: "/project/scripts/helper.gml" });
        tracker.declare("helperFn", { name: "helperFn" });
        tracker.exitScope();

        // File that only references the symbol
        tracker.enterScope("file", { path: "/project/objects/obj_player.gml" });
        tracker.reference("helperFn", { name: "helperFn" });
        tracker.exitScope();

        const declaringPaths = tracker.getFilePathsDeclaringSymbol("helperFn");

        assert.equal(declaringPaths.size, 1);
        assert.ok(declaringPaths.has("/project/scripts/helper.gml"), "Should include declaring file");
        assert.ok(!declaringPaths.has("/project/objects/obj_player.gml"), "Should not include reference-only file");
    });

    void it("returns multiple paths when the symbol is declared in more than one file", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("file", { path: "/project/scripts/a.gml" });
        tracker.declare("shared", { name: "shared" });
        tracker.exitScope();

        tracker.enterScope("file", { path: "/project/scripts/b.gml" });
        tracker.declare("shared", { name: "shared" });
        tracker.exitScope();

        const paths = tracker.getFilePathsDeclaringSymbol("shared");

        assert.equal(paths.size, 2);
        assert.ok(paths.has("/project/scripts/a.gml"));
        assert.ok(paths.has("/project/scripts/b.gml"));
    });

    void it("normalizes backslash path separators to forward slashes", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("file", { path: String.raw`C:\project\scripts\helper.gml` });
        tracker.declare("fn", { name: "fn" });
        tracker.exitScope();

        const paths = tracker.getFilePathsDeclaringSymbol("fn");

        assert.equal(paths.size, 1);
        assert.ok(paths.has("C:/project/scripts/helper.gml"), "Should normalize backslashes");
    });

    void it("skips scopes that have no path metadata", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Anonymous scope with no path
        tracker.enterScope("block");
        tracker.declare("localVar", { name: "localVar" });
        tracker.exitScope();

        const paths = tracker.getFilePathsDeclaringSymbol("localVar");

        assert.equal(paths.size, 0, "Scopes without path should not contribute file paths");
    });

    void it("complements getFilePathsReferencingSymbol for hot-reload impact analysis", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Symbol declared in one file, referenced in two others
        tracker.enterScope("file", { path: "/src/scripts/scr_util.gml" });
        tracker.declare("utilFn", { name: "utilFn" });
        tracker.exitScope();

        tracker.enterScope("file", { path: "/src/objects/obj_a/Create_0.gml" });
        tracker.reference("utilFn", { name: "utilFn" });
        tracker.exitScope();

        tracker.enterScope("file", { path: "/src/objects/obj_b/Step_0.gml" });
        tracker.reference("utilFn", { name: "utilFn" });
        tracker.exitScope();

        const declaringPaths = tracker.getFilePathsDeclaringSymbol("utilFn");
        const referencingPaths = tracker.getFilePathsReferencingSymbol("utilFn");

        // Declaration side: only the script file
        assert.equal(declaringPaths.size, 1);
        assert.ok(declaringPaths.has("/src/scripts/scr_util.gml"));

        // Reference side: both object event files
        assert.equal(referencingPaths.size, 2);
        assert.ok(referencingPaths.has("/src/objects/obj_a/Create_0.gml"));
        assert.ok(referencingPaths.has("/src/objects/obj_b/Step_0.gml"));

        // The declaring file is not in the referencing set (it only declares)
        assert.ok(!referencingPaths.has("/src/scripts/scr_util.gml"));
    });
});
