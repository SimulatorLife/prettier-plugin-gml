import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import ScopeTracker from "../src/scopes/scope-tracker.js";

void describe("ScopeTracker: scope metadata", () => {
    void test("getScopeMetadata returns null for non-existent scope", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const result = tracker.getScopeMetadata("scope-999");
        assert.strictEqual(result, null);
    });

    void test("getScopeMetadata returns null for null scope", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const result = tracker.getScopeMetadata(null);
        assert.strictEqual(result, null);
    });

    void test("getScopeMetadata returns basic scope info without optional metadata", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const scope = tracker.enterScope("function");

        const metadata = tracker.getScopeMetadata(scope.id);
        assert.ok(metadata);
        assert.strictEqual(metadata.scopeId, scope.id);
        assert.strictEqual(metadata.scopeKind, "function");
        assert.strictEqual(metadata.name, undefined);
        assert.strictEqual(metadata.path, undefined);
        assert.strictEqual(metadata.start, undefined);
        assert.strictEqual(metadata.end, undefined);
    });

    void test("getScopeMetadata returns scope with name metadata", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const scope = tracker.enterScope("function", { name: "myFunction" });

        const metadata = tracker.getScopeMetadata(scope.id);
        assert.ok(metadata);
        assert.strictEqual(metadata.scopeId, scope.id);
        assert.strictEqual(metadata.scopeKind, "function");
        assert.strictEqual(metadata.name, "myFunction");
        assert.strictEqual(metadata.path, undefined);
        assert.strictEqual(metadata.start, undefined);
        assert.strictEqual(metadata.end, undefined);
    });

    void test("getScopeMetadata returns scope with path metadata", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const scope = tracker.enterScope("program", {
            path: "scripts/player_movement/player_movement.gml"
        });

        const metadata = tracker.getScopeMetadata(scope.id);
        assert.ok(metadata);
        assert.strictEqual(metadata.scopeId, scope.id);
        assert.strictEqual(metadata.scopeKind, "program");
        assert.strictEqual(metadata.path, "scripts/player_movement/player_movement.gml");
    });

    void test("getScopeMetadata returns scope with full location metadata", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const scope = tracker.enterScope("function", {
            name: "updatePlayer",
            path: "scripts/player_movement/player_movement.gml",
            start: { line: 10, column: 0, index: 250 },
            end: { line: 25, column: 1, index: 500 }
        });

        const metadata = tracker.getScopeMetadata(scope.id);
        assert.ok(metadata);
        assert.strictEqual(metadata.scopeId, scope.id);
        assert.strictEqual(metadata.scopeKind, "function");
        assert.strictEqual(metadata.name, "updatePlayer");
        assert.strictEqual(metadata.path, "scripts/player_movement/player_movement.gml");
        assert.ok(metadata.start);
        assert.strictEqual(metadata.start.line, 10);
        assert.strictEqual(metadata.start.column, 0);
        assert.strictEqual(metadata.start.index, 250);
        assert.ok(metadata.end);
        assert.strictEqual(metadata.end.line, 25);
        assert.strictEqual(metadata.end.column, 1);
        assert.strictEqual(metadata.end.index, 500);
    });

    void test("getScopeMetadata clones location data to prevent mutations", () => {
        const tracker = new ScopeTracker({ enabled: true });
        const scope = tracker.enterScope("function", {
            start: { line: 1, column: 0, index: 0 },
            end: { line: 10, column: 0, index: 100 }
        });

        const metadata1 = tracker.getScopeMetadata(scope.id);
        const metadata2 = tracker.getScopeMetadata(scope.id);

        assert.ok(metadata1);
        assert.ok(metadata2);
        assert.notStrictEqual(metadata1.start, metadata2.start);
        assert.notStrictEqual(metadata1.end, metadata2.end);
        assert.deepStrictEqual(metadata1.start, metadata2.start);
        assert.deepStrictEqual(metadata1.end, metadata2.end);
    });

    void test("withScope accepts metadata parameter", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const result = tracker.withScope(
            "block",
            () => {
                const current = tracker.currentScope();
                assert.ok(current);
                return current.id;
            },
            { name: "testBlock", path: "test.gml" }
        );

        const metadata = tracker.getScopeMetadata(result);
        assert.ok(metadata);
        assert.strictEqual(metadata.name, "testBlock");
        assert.strictEqual(metadata.path, "test.gml");
    });

    void test("scope metadata supports hot reload file tracking", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Simulate multiple scopes in different files
        const programScope = tracker.enterScope("program", {
            path: "scripts/game_state/game_state.gml"
        });

        const fn1Scope = tracker.enterScope("function", {
            name: "initGameState",
            path: "scripts/game_state/game_state.gml",
            start: { line: 1, column: 0, index: 0 },
            end: { line: 10, column: 1, index: 200 }
        });
        tracker.exitScope();

        const fn2Scope = tracker.enterScope("function", {
            name: "updateGameState",
            path: "scripts/game_state/game_state.gml",
            start: { line: 12, column: 0, index: 202 },
            end: { line: 30, column: 1, index: 600 }
        });
        tracker.exitScope();

        // Query metadata for each scope
        const programMeta = tracker.getScopeMetadata(programScope.id);
        const fn1Meta = tracker.getScopeMetadata(fn1Scope.id);
        const fn2Meta = tracker.getScopeMetadata(fn2Scope.id);

        // All scopes in the same file
        assert.strictEqual(programMeta?.path, "scripts/game_state/game_state.gml");
        assert.strictEqual(fn1Meta?.path, "scripts/game_state/game_state.gml");
        assert.strictEqual(fn2Meta?.path, "scripts/game_state/game_state.gml");

        // Function names are tracked
        assert.strictEqual(fn1Meta?.name, "initGameState");
        assert.strictEqual(fn2Meta?.name, "updateGameState");

        // Source ranges are preserved
        assert.strictEqual(fn1Meta?.start?.line, 1);
        assert.strictEqual(fn1Meta?.end?.line, 10);
        assert.strictEqual(fn2Meta?.start?.line, 12);
        assert.strictEqual(fn2Meta?.end?.line, 30);
    });

    void test("scope metadata supports nested scope tracking", () => {
        const tracker = new ScopeTracker({ enabled: true });

        const programScope = tracker.enterScope("program", {
            path: "scripts/collision/collision.gml"
        });

        const functionScope = tracker.enterScope("function", {
            name: "checkCollision",
            path: "scripts/collision/collision.gml",
            start: { line: 5, column: 0, index: 100 },
            end: { line: 20, column: 1, index: 400 }
        });

        const blockScope = tracker.enterScope("block", {
            name: "collisionLoop",
            path: "scripts/collision/collision.gml",
            start: { line: 10, column: 4, index: 250 },
            end: { line: 15, column: 5, index: 350 }
        });

        // Verify nested structure is maintained
        const blockMeta = tracker.getScopeMetadata(blockScope.id);
        const functionMeta = tracker.getScopeMetadata(functionScope.id);
        const programMeta = tracker.getScopeMetadata(programScope.id);

        assert.ok(blockMeta);
        assert.ok(functionMeta);
        assert.ok(programMeta);

        // All in same file
        assert.strictEqual(blockMeta.path, functionMeta.path);
        assert.strictEqual(functionMeta.path, programMeta.path);

        // Nested ranges are properly bounded
        assert.ok(blockMeta.start && functionMeta.start);
        assert.ok(blockMeta.start.index >= functionMeta.start.index);
        assert.ok(blockMeta.end && functionMeta.end);
        assert.ok(blockMeta.end.index <= functionMeta.end.index);
    });

    void test("scope metadata enables file-based invalidation queries", () => {
        const tracker = new ScopeTracker({ enabled: true });

        // Create scopes in multiple files
        const file1Scope1 = tracker.enterScope("program", { path: "scripts/player.gml" });
        tracker.exitScope();

        const file2Scope1 = tracker.enterScope("program", { path: "scripts/enemy.gml" });
        const file2Scope2 = tracker.enterScope("function", {
            name: "enemyAttack",
            path: "scripts/enemy.gml"
        });
        tracker.exitScope();
        tracker.exitScope();

        const file1Scope2 = tracker.enterScope("program", { path: "scripts/player.gml" });
        tracker.exitScope();

        // Query all scopes and group by file
        const allScopeIds = [file1Scope1.id, file2Scope1.id, file2Scope2.id, file1Scope2.id];

        const scopesByFile = new Map<string, string[]>();
        for (const scopeId of allScopeIds) {
            const metadata = tracker.getScopeMetadata(scopeId);
            if (metadata?.path) {
                if (!scopesByFile.has(metadata.path)) {
                    scopesByFile.set(metadata.path, []);
                }
                scopesByFile.get(metadata.path).push(scopeId);
            }
        }

        // Verify grouping
        assert.strictEqual(scopesByFile.size, 2);
        assert.strictEqual(scopesByFile.get("scripts/player.gml")?.length, 2);
        assert.strictEqual(scopesByFile.get("scripts/enemy.gml")?.length, 2);
    });
});
