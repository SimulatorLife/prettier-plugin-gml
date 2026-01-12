import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { RefactorEngine } from "../src/refactor-engine.js";
import { WorkspaceEdit } from "../src/workspace-edit.js";
import type { PartialSemanticAnalyzer } from "../src/types.js";

void describe("hot reload diagnostics", () => {
    void test("provides diagnostics when includeDiagnostics is true", async () => {
        const semantic: PartialSemanticAnalyzer = {
            getFileSymbols: async (filePath: string) => {
                if (filePath === "test.gml") {
                    return [{ id: "gml/script/scr_test" }];
                }
                return [];
            }
        };

        const engine = new RefactorEngine({ semantic });
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "newCode");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.ok(Array.isArray(validation.hotReloadDiagnostics.affectedSymbols));
        assert.strictEqual(typeof validation.hotReloadDiagnostics.recompilationRequired, "boolean");
        assert.strictEqual(typeof validation.hotReloadDiagnostics.safeDuringGameplay, "boolean");
        assert.strictEqual(typeof validation.hotReloadDiagnostics.estimatedReloadTime, "number");
    });

    void test("does not include diagnostics when includeDiagnostics is false", async () => {
        const engine = new RefactorEngine({});
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "newCode");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: false
        });

        assert.strictEqual(validation.hotReloadDiagnostics, undefined);
    });

    void test("identifies script symbols as hot-reloadable", async () => {
        const semantic: PartialSemanticAnalyzer = {
            getFileSymbols: async () => [{ id: "gml/script/scr_player" }]
        };

        const engine = new RefactorEngine({ semantic });
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "function scr_player() {}");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.ok(validation.hotReloadDiagnostics.affectedSymbols.length > 0);
        const scriptSymbol = validation.hotReloadDiagnostics.affectedSymbols.find(
            (s) => s.symbolId === "gml/script/scr_player"
        );
        assert.ok(scriptSymbol);
        assert.strictEqual(scriptSymbol.hotReloadable, true);
    });

    void test("identifies macro symbols as requiring recompilation", async () => {
        const semantic: PartialSemanticAnalyzer = {
            getFileSymbols: async () => [{ id: "gml/macro/MY_CONSTANT" }]
        };

        const engine = new RefactorEngine({ semantic });
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "#macro MY_CONSTANT 42");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.strictEqual(validation.hotReloadDiagnostics.recompilationRequired, true);

        const macroSymbol = validation.hotReloadDiagnostics.affectedSymbols.find(
            (s) => s.symbolId === "gml/macro/MY_CONSTANT"
        );
        assert.ok(macroSymbol);
        assert.strictEqual(macroSymbol.hotReloadable, false);
        assert.ok(macroSymbol.reason);
        assert.ok(macroSymbol.reason.includes("macro"));
    });

    void test("identifies enum symbols as requiring recompilation", async () => {
        const semantic: PartialSemanticAnalyzer = {
            getFileSymbols: async () => [{ id: "gml/enum/MyEnum" }]
        };

        const engine = new RefactorEngine({ semantic });
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "enum MyEnum { VALUE1, VALUE2 }");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.strictEqual(validation.hotReloadDiagnostics.recompilationRequired, true);

        const enumSymbol = validation.hotReloadDiagnostics.affectedSymbols.find(
            (s) => s.symbolId === "gml/enum/MyEnum"
        );
        assert.ok(enumSymbol);
        assert.strictEqual(enumSymbol.hotReloadable, false);
        assert.ok(enumSymbol.reason);
        assert.ok(enumSymbol.reason.includes("enum"));
    });

    void test("estimates reload time based on symbol count and type", async () => {
        const semantic: PartialSemanticAnalyzer = {
            getFileSymbols: async () => [
                { id: "gml/script/scr_1" },
                { id: "gml/script/scr_2" },
                { id: "gml/macro/MACRO_1" }
            ]
        };

        const engine = new RefactorEngine({ semantic });
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "code");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.ok(validation.hotReloadDiagnostics.estimatedReloadTime > 0);
        // Scripts ~50ms each (2 = 100ms), macro ~200ms, total ~300ms
        assert.ok(validation.hotReloadDiagnostics.estimatedReloadTime >= 200);
    });

    void test("marks as unsafe during gameplay when globalvar detected", async () => {
        const engine = new RefactorEngine({});
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "globalvar myGlobal;");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.strictEqual(validation.hotReloadDiagnostics.safeDuringGameplay, false);
    });

    void test("marks as unsafe during gameplay when macro detected", async () => {
        const engine = new RefactorEngine({});
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "#macro TEST 42");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.strictEqual(validation.hotReloadDiagnostics.safeDuringGameplay, false);
    });

    void test("marks as unsafe during gameplay when enum detected", async () => {
        const engine = new RefactorEngine({});
        const workspace = new WorkspaceEdit();
        workspace.addEdit("test.gml", 0, 10, "enum MyEnum { A, B }");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.strictEqual(validation.hotReloadDiagnostics.safeDuringGameplay, false);
    });

    void test("increases estimated reload time for large edits", async () => {
        const engine = new RefactorEngine({});
        const workspace = new WorkspaceEdit();
        const largeCode = "x".repeat(6000);
        workspace.addEdit("test.gml", 0, 10, largeCode);

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.ok(validation.hotReloadDiagnostics.estimatedReloadTime >= 500);
    });

    void test("handles multiple files with different characteristics", async () => {
        const semantic: PartialSemanticAnalyzer = {
            getFileSymbols: async (filePath: string) => {
                if (filePath === "script.gml") {
                    return [{ id: "gml/script/scr_test" }];
                }
                if (filePath === "macros.gml") {
                    return [{ id: "gml/macro/MY_MACRO" }];
                }
                return [];
            }
        };

        const engine = new RefactorEngine({ semantic });
        const workspace = new WorkspaceEdit();
        workspace.addEdit("script.gml", 0, 10, "function scr_test() {}");
        workspace.addEdit("macros.gml", 0, 10, "#macro MY_MACRO 42");

        const validation = await engine.validateHotReloadCompatibility(workspace, {
            includeDiagnostics: true
        });

        assert.ok(validation.hotReloadDiagnostics);
        assert.strictEqual(validation.hotReloadDiagnostics.affectedSymbols.length, 2);
        assert.strictEqual(validation.hotReloadDiagnostics.recompilationRequired, true);
    });
});
