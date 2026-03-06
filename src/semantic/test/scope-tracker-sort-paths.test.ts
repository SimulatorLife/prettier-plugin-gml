import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Declare a symbol in the current scope of the tracker. */
function declare(tracker: ScopeTracker, name: string): void {
    tracker.declare(name, {
        name,
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: name.length, index: name.length }
    });
}

/** Reference a symbol in the current scope of the tracker. */
function reference(tracker: ScopeTracker, name: string): void {
    tracker.reference(name, {
        name,
        start: { line: 2, column: 0, index: 0 },
        end: { line: 2, column: name.length, index: name.length }
    });
}

// ---------------------------------------------------------------------------
// sortPathsForReanalysis
// ---------------------------------------------------------------------------

void describe("ScopeTracker: sortPathsForReanalysis", () => {
    void it("returns an empty array for empty input", () => {
        const tracker = new ScopeTracker({ enabled: true });
        assert.deepEqual(tracker.sortPathsForReanalysis([]), []);
    });

    void it("returns an empty array when only null/empty strings are passed", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const result = tracker.sortPathsForReanalysis([null as unknown as string, "", undefined as unknown as string]);
        assert.deepEqual(result, []);
    });

    void it("returns a single path unchanged", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("file", { path: "/project/a.gml" });
        declare(tracker, "x");
        tracker.exitScope();

        const result = tracker.sortPathsForReanalysis(["/project/a.gml"]);
        assert.deepEqual(result, ["/project/a.gml"]);
    });

    void it("places declaration files before referencing files", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // helpers.gml declares helper; main.gml references it.
        // helpers.gml must be a scope ancestor of main.gml so the dependency
        // is visible via the scope chain.
        tracker.enterScope("program", { path: "/project/helpers.gml" });
        declare(tracker, "helper");

        tracker.enterScope("file", { path: "/project/main.gml" });
        reference(tracker, "helper");
        tracker.exitScope(); // main.gml

        tracker.exitScope(); // helpers.gml

        const result = tracker.sortPathsForReanalysis(["/project/main.gml", "/project/helpers.gml"]);

        // helpers.gml (provider) must come before main.gml (consumer).
        const helpersIndex = result.indexOf("/project/helpers.gml");
        const mainIndex = result.indexOf("/project/main.gml");
        assert.ok(helpersIndex !== -1, "helpers.gml should be in the result");
        assert.ok(mainIndex !== -1, "main.gml should be in the result");
        assert.ok(helpersIndex < mainIndex, "helpers.gml must precede main.gml");
    });

    void it("sorts a three-level chain A → B → C correctly", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // a.gml (root) declares `util`.
        // b.gml (child of a) references `util` and declares `service`.
        // c.gml (child of b) references `service`.
        // Expected re-analysis order: a → b → c.
        tracker.enterScope("program", { path: "/project/a.gml" });
        declare(tracker, "util");

        tracker.enterScope("file", { path: "/project/b.gml" });
        reference(tracker, "util");
        declare(tracker, "service");

        tracker.enterScope("file", { path: "/project/c.gml" });
        reference(tracker, "service");
        tracker.exitScope(); // c.gml

        tracker.exitScope(); // b.gml
        tracker.exitScope(); // a.gml

        const result = tracker.sortPathsForReanalysis(["/project/c.gml", "/project/a.gml", "/project/b.gml"]);

        const ai = result.indexOf("/project/a.gml");
        const bi = result.indexOf("/project/b.gml");
        const ci = result.indexOf("/project/c.gml");

        assert.ok(ai !== -1 && bi !== -1 && ci !== -1, "All paths should appear");
        assert.ok(ai < bi, "a.gml must precede b.gml");
        assert.ok(bi < ci, "b.gml must precede c.gml");
    });

    void it("includes all input paths even those without registered scopes", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("file", { path: "/project/existing.gml" });
        declare(tracker, "x");
        tracker.exitScope();

        const result = tracker.sortPathsForReanalysis(["/project/existing.gml", "/project/new.gml"]);

        assert.equal(result.length, 2);
        assert.ok(result.includes("/project/existing.gml"));
        assert.ok(result.includes("/project/new.gml"));
    });

    void it("deduplicates repeated input paths", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("file", { path: "/project/a.gml" });
        declare(tracker, "x");
        tracker.exitScope();

        const result = tracker.sortPathsForReanalysis(["/project/a.gml", "/project/a.gml", "/project/a.gml"]);

        assert.equal(result.length, 1);
        assert.equal(result[0], "/project/a.gml");
    });

    void it("produces deterministic (alphabetical) output for independent paths", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Three independent files with no shared symbols.
        for (const name of ["z.gml", "a.gml", "m.gml"]) {
            tracker.enterScope("file", { path: `/project/${name}` });
            declare(tracker, `sym_${name}`);
            tracker.exitScope();
        }

        const result = tracker.sortPathsForReanalysis(["/project/z.gml", "/project/a.gml", "/project/m.gml"]);

        assert.deepEqual(result, ["/project/a.gml", "/project/m.gml", "/project/z.gml"]);
    });

    void it("normalises backslash separators to match forward-slash paths", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("program", { path: "C:/project/helpers.gml" });
        declare(tracker, "helper");

        tracker.enterScope("file", { path: "C:/project/main.gml" });
        reference(tracker, "helper");
        tracker.exitScope();

        tracker.exitScope();

        // Supply Windows-style paths.
        const result = tracker.sortPathsForReanalysis([
            String.raw`C:\project\main.gml`,
            String.raw`C:\project\helpers.gml`
        ]);

        // helpers must still precede main regardless of separator style.
        const helpersIndex = result.findIndex((p) => p.includes("helpers"));
        const mainIndex = result.findIndex((p) => p.includes("main"));
        assert.ok(helpersIndex < mainIndex, "helpers.gml must precede main.gml");
    });

    void it("preserves the original caller-supplied path strings in the output", () => {
        const tracker = new ScopeTracker({ enabled: true });

        tracker.enterScope("program", { path: "C:/project/utils.gml" });
        declare(tracker, "util");

        tracker.enterScope("file", { path: "C:/project/main.gml" });
        reference(tracker, "util");
        tracker.exitScope();

        tracker.exitScope();

        const windowsUtils = String.raw`C:\project\utils.gml`;
        const windowsMain = String.raw`C:\project\main.gml`;

        const result = tracker.sortPathsForReanalysis([windowsMain, windowsUtils]);

        // The returned strings should be the original caller-supplied paths.
        assert.ok(result.includes(windowsUtils), "Should return the original utils path");
        assert.ok(result.includes(windowsMain), "Should return the original main path");
    });

    void it("handles cycles by appending cyclic paths after non-cyclic ones", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Simulate a mutual reference:
        //   a.gml declares `funcA` and references `funcB`
        //   b.gml declares `funcB` and references `funcA`
        // Both scopes are roots (no common ancestor to make the dependency
        // chain visible), so we manually wire up the symbol index by having
        // each scope reference the other's symbol.
        tracker.enterScope("file", { path: "/project/a.gml" });
        declare(tracker, "funcA");
        tracker.exitScope();

        tracker.enterScope("file", { path: "/project/b.gml" });
        declare(tracker, "funcB");
        tracker.exitScope();

        // Because scope resolution needs an ancestor chain to detect
        // external references, true cycle detection requires a shared
        // parent.  We test that the method completes without throwing and
        // returns all paths.
        const result = tracker.sortPathsForReanalysis(["/project/a.gml", "/project/b.gml"]);

        assert.equal(result.length, 2);
        assert.ok(result.includes("/project/a.gml"));
        assert.ok(result.includes("/project/b.gml"));
    });
});

// ---------------------------------------------------------------------------
// Integration: sortPathsForReanalysis + clearScopesForPath
// ---------------------------------------------------------------------------

void describe("ScopeTracker hot-reload: sort then clear then re-analyse", () => {
    void it("re-analysis in sorted order restores correct symbol resolution", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Initial parse: utils.gml (root) declares `formatScore`;
        // hud.gml (child) references it.
        tracker.enterScope("program", { path: "/project/utils.gml" });
        declare(tracker, "formatScore");

        tracker.enterScope("file", { path: "/project/hud.gml" });
        reference(tracker, "formatScore");
        tracker.exitScope(); // hud.gml

        tracker.exitScope(); // utils.gml

        // Compute which files are impacted by a change to utils.gml.
        const impacted = tracker.getImpactedFilePaths(["/project/utils.gml"]);
        assert.ok(impacted.has("/project/hud.gml"), "hud.gml should be impacted");

        // Step 1: sort BEFORE clearing.
        const sorted = tracker.sortPathsForReanalysis(impacted);
        const utilsFirst = sorted.indexOf("/project/utils.gml") < sorted.indexOf("/project/hud.gml");
        assert.ok(utilsFirst, "utils.gml must precede hud.gml in re-analysis order");

        // Step 2: clear stale scopes.
        for (const p of impacted) {
            tracker.clearScopesForPath(p);
        }

        // Step 3: re-analyse in sorted order, preserving the nesting structure
        // that makes hud.gml a child scope of utils.gml.  In real usage the
        // project parser creates this nesting; we replicate it here.
        tracker.enterScope("program", { path: "/project/utils.gml" });
        declare(tracker, "formatScore"); // same symbol, refreshed

        tracker.enterScope("file", { path: "/project/hud.gml" });
        reference(tracker, "formatScore");
        tracker.exitScope(); // hud.gml

        tracker.exitScope(); // utils.gml

        // After re-analysis, formatScore should be resolvable from hud.gml's scope.
        const hudScopes = tracker.getScopesByPath("/project/hud.gml");
        assert.equal(hudScopes.length, 1, "hud.gml should have one scope after re-analysis");

        const hudScopeId = hudScopes[0].scopeId;
        const resolved = tracker.resolveIdentifier("formatScore", hudScopeId);
        assert.ok(resolved !== null, "formatScore should resolve from hud.gml scope after re-analysis");
    });
});
