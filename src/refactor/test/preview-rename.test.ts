import assert from "node:assert/strict";
import test from "node:test";
import { Refactor, type SemanticAnalyzer } from "../index.js";
import {
    generateRenamePreview,
    commitRenamePreview,
    type RenamePreview
} from "../src/preview-rename.js";

const { RefactorEngine: RefactorEngineClass } = Refactor;

void test("generateRenamePreview requires valid RefactorEngine", async () => {
    await assert.rejects(
        () =>
            generateRenamePreview(
                null as any,
                { symbolId: "test", newName: "new" },
                {
                    readFile: async () => ""
                }
            ),
        {
            name: "TypeError",
            message: /requires a valid RefactorEngine/
        }
    );
});

void test("generateRenamePreview requires readFile function", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            generateRenamePreview(
                engine,
                { symbolId: "test", newName: "new" },
                {
                    readFile: null as any
                }
            ),
        {
            name: "TypeError",
            message: /requires a readFile function/
        }
    );
});

void test("generateRenamePreview generates complete preview", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async (name) => {
            if (name === "scr_old") {
                return [
                    {
                        path: "test.gml",
                        start: 9,
                        end: 16,
                        scopeId: "scope-1",
                        kind: "definition"
                    },
                    {
                        path: "test.gml",
                        start: 21,
                        end: 28,
                        scopeId: "scope-1",
                        kind: "reference"
                    }
                ];
            }
            return [];
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = {
        "test.gml": "function scr_old() { scr_old(); }"
    };

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_old",
            newName: "scr_new"
        },
        {
            readFile: async (path) => files[path]
        }
    );

    // Verify all preview components are present
    assert.ok(preview.workspace);
    assert.ok(preview.validation);
    assert.ok(preview.impact);
    assert.ok(preview.preview);
    assert.ok(preview.integrity);
    assert.equal(preview.hotReload, null);

    // Verify workspace edit was created
    assert.ok(Array.isArray(preview.workspace.edits));
    assert.equal(preview.workspace.edits.length, 2);

    // Verify validation passed
    assert.equal(preview.validation.valid, true);
    assert.equal(preview.validation.errors.length, 0);

    // Verify impact analysis
    assert.equal(preview.impact.valid, true);
    assert.equal(preview.impact.summary.oldName, "scr_old");
    assert.equal(preview.impact.summary.newName, "scr_new");
    assert.equal(preview.impact.summary.totalOccurrences, 2);
    assert.equal(preview.impact.summary.affectedFiles.length, 1);

    // Verify preview content
    assert.ok(preview.preview.has("test.gml"));
    assert.equal(
        preview.preview.get("test.gml"),
        "function scr_new() { scr_new(); }"
    );

    // Verify integrity check passed
    assert.equal(preview.integrity.valid, true);
    assert.equal(preview.integrity.errors.length, 0);
});

void test("generateRenamePreview includes hot reload when requested", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 0, end: 7, scopeId: "scope-1" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_test",
            newName: "scr_renamed"
        },
        {
            readFile: async () => "function scr_test() {}",
            includeHotReload: true
        }
    );

    // Hot reload validation should be present
    assert.ok(preview.hotReload);
    assert.equal(preview.hotReload.valid, true);
    assert.ok(Array.isArray(preview.hotReload.errors));
    assert.ok(Array.isArray(preview.hotReload.warnings));
});

void test("generateRenamePreview includes transpiler check when requested", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 0, end: 7, scopeId: "scope-1" }
        ]
    };

    const mockFormatter = {
        transpileScript: async () => ({ kind: "script", js_body: "ok" })
    };

    const engine = new RefactorEngineClass({
        semantic: mockSemantic,
        formatter: mockFormatter
    });

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_test",
            newName: "scr_renamed"
        },
        {
            readFile: async () => "function scr_test() {}",
            includeHotReload: true,
            checkTranspiler: true
        }
    );

    assert.ok(preview.hotReload);
    assert.ok(
        preview.hotReload.warnings.some((w) =>
            w.includes("Transpiler compatibility")
        )
    );
});

void test("generateRenamePreview detects validation errors", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" },
            { path: "test.gml", start: 5, end: 15, scopeId: "scope-1" } // Overlapping
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_test",
            newName: "scr_new"
        },
        {
            readFile: async () => "scr_test scr_test"
        }
    );

    // Validation should detect overlapping edits
    assert.equal(preview.validation.valid, false);
    assert.ok(preview.validation.errors.some((e) => e.includes("Overlapping")));

    // Preview should be empty since validation failed
    assert.equal(preview.preview.size, 0);
});

void test("generateRenamePreview detects integrity issues", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 0, end: 3, scopeId: "scope-1" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/old",
            newName: "new"
        },
        {
            readFile: async () => "function old() { old(); }"
        }
    );

    // Integrity check should detect lingering old name
    assert.equal(preview.integrity.valid, false);
    assert.ok(
        preview.integrity.errors.some(
            (e) => e.includes("Old name") && e.includes("still exists")
        )
    );
});

void test("generateRenamePreview handles multi-file renames", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "file1.gml", start: 9, end: 16, scopeId: "scope-1" },
            { path: "file2.gml", start: 10, end: 17, scopeId: "scope-2" },
            { path: "file3.gml", start: 5, end: 12, scopeId: "scope-3" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = {
        "file1.gml": "function scr_old() {}",
        "file2.gml": "var x = { scr_old: 1 };",
        "file3.gml": "call(scr_old);"
    };

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_old",
            newName: "scr_new"
        },
        {
            readFile: async (path) => files[path]
        }
    );

    // Verify all files are in preview
    assert.equal(preview.preview.size, 3);
    assert.ok(preview.preview.has("file1.gml"));
    assert.ok(preview.preview.has("file2.gml"));
    assert.ok(preview.preview.has("file3.gml"));

    // Verify content was updated
    assert.equal(preview.preview.get("file1.gml"), "function scr_new() {}");
    assert.equal(preview.preview.get("file2.gml"), "var x = { scr_new: 1 };");
    assert.equal(preview.preview.get("file3.gml"), "call(scr_new);");

    // Verify impact analysis
    assert.equal(preview.impact.summary.affectedFiles.length, 3);
    assert.ok(preview.impact.summary.affectedFiles.includes("file1.gml"));
    assert.ok(preview.impact.summary.affectedFiles.includes("file2.gml"));
    assert.ok(preview.impact.summary.affectedFiles.includes("file3.gml"));
});

void test("commitRenamePreview requires valid RefactorEngine", async () => {
    const mockPreview: RenamePreview = {
        workspace: null as any,
        validation: { valid: true, errors: [], warnings: [] },
        impact: null as any,
        preview: new Map(),
        integrity: { valid: true, errors: [], warnings: [] },
        hotReload: null
    };

    await assert.rejects(
        () =>
            commitRenamePreview(null as any, {
                preview: mockPreview,
                writeFile: async () => {}
            }),
        {
            name: "TypeError",
            message: /requires a valid RefactorEngine/
        }
    );
});

void test("commitRenamePreview requires valid preview", async () => {
    const engine = new RefactorEngineClass();

    await assert.rejects(
        () =>
            commitRenamePreview(engine, {
                preview: null as any,
                writeFile: async () => {}
            }),
        {
            name: "TypeError",
            message: /requires a valid RenamePreview/
        }
    );
});

void test("commitRenamePreview requires writeFile function", async () => {
    const engine = new RefactorEngineClass();
    const mockPreview: RenamePreview = {
        workspace: null as any,
        validation: { valid: true, errors: [], warnings: [] },
        impact: null as any,
        preview: new Map(),
        integrity: { valid: true, errors: [], warnings: [] },
        hotReload: null
    };

    await assert.rejects(
        () =>
            commitRenamePreview(engine, {
                preview: mockPreview,
                writeFile: null as any
            }),
        {
            name: "TypeError",
            message: /requires a writeFile function/
        }
    );
});

void test("commitRenamePreview writes exactly what was previewed", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 9, end: 16, scopeId: "scope-1" },
            { path: "test.gml", start: 21, end: 28, scopeId: "scope-1" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = {
        "test.gml": "function scr_old() { scr_old(); }"
    };

    // Generate preview
    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_old",
            newName: "scr_new"
        },
        {
            readFile: async (path) => files[path]
        }
    );

    // Commit preview
    const writtenFiles: Record<string, string> = {};
    const result = await commitRenamePreview(engine, {
        preview,
        writeFile: async (path, content) => {
            writtenFiles[path] = content;
        }
    });

    // Verify exactly what was in preview was written
    assert.equal(result.size, 1);
    assert.ok(result.has("test.gml"));
    assert.equal(result.get("test.gml"), preview.preview.get("test.gml"));
    assert.equal(writtenFiles["test.gml"], preview.preview.get("test.gml"));
    assert.equal(writtenFiles["test.gml"], "function scr_new() { scr_new(); }");
});

void test("commitRenamePreview handles multi-file commits", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "file1.gml", start: 9, end: 16, scopeId: "scope-1" },
            { path: "file2.gml", start: 10, end: 17, scopeId: "scope-2" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = {
        "file1.gml": "function scr_old() {}",
        "file2.gml": "var x = { scr_old: 1 };"
    };

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_old",
            newName: "scr_new"
        },
        {
            readFile: async (path) => files[path]
        }
    );

    const writtenFiles: Record<string, string> = {};
    const result = await commitRenamePreview(engine, {
        preview,
        writeFile: async (path, content) => {
            writtenFiles[path] = content;
        }
    });

    // Verify both files were written
    assert.equal(result.size, 2);
    assert.ok(result.has("file1.gml"));
    assert.ok(result.has("file2.gml"));

    // Verify content matches preview
    assert.equal(writtenFiles["file1.gml"], preview.preview.get("file1.gml"));
    assert.equal(writtenFiles["file2.gml"], preview.preview.get("file2.gml"));
    assert.equal(writtenFiles["file1.gml"], "function scr_new() {}");
    assert.equal(writtenFiles["file2.gml"], "var x = { scr_new: 1 };");
});

void test("commitRenamePreview only writes files in preview", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 9, end: 17, scopeId: "scope-1" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_test",
            newName: "scr_renamed"
        },
        {
            readFile: async () => "function scr_test() {}"
        }
    );

    // Manually corrupt the workspace to add an edit for a file not in preview
    // This simulates a programming error or workspace corruption
    preview.workspace.addEdit("missing.gml", 0, 5, "new");

    // commitRenamePreview should only write files that are in the preview
    // The corrupted workspace edit should be ignored
    const writtenFiles: Array<string> = [];
    await commitRenamePreview(engine, {
        preview,
        writeFile: async (path) => {
            writtenFiles.push(path);
        }
    });

    // Should only write the file that was in the preview
    assert.equal(writtenFiles.length, 1);
    assert.equal(writtenFiles[0], "test.gml");
    assert.ok(!writtenFiles.includes("missing.gml"));
});

void test("generateRenamePreview and commitRenamePreview full workflow", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            {
                path: "scripts/player.gml",
                start: 9,
                end: 19,
                scopeId: "scope-1",
                kind: "definition"
            },
            {
                path: "scripts/player.gml",
                start: 24,
                end: 34,
                scopeId: "scope-1",
                kind: "reference"
            },
            {
                path: "scripts/enemy.gml",
                start: 18,
                end: 28,
                scopeId: "scope-2",
                kind: "reference"
            }
        ],
        getDependents: async () => [
            {
                symbolId: "gml/script/scr_helper",
                filePath: "scripts/helper.gml"
            }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = {
        "scripts/player.gml": "function scr_player() { scr_player(); }",
        "scripts/enemy.gml": "var enemy = { ai: scr_player };"
    };

    // Step 1: Generate preview
    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_player",
            newName: "scr_hero"
        },
        {
            readFile: async (path) => files[path],
            includeHotReload: true
        }
    );

    // Verify preview is complete and valid
    assert.equal(preview.validation.valid, true);
    assert.equal(preview.impact.valid, true);
    assert.equal(preview.integrity.valid, true);
    assert.ok(preview.hotReload);
    assert.equal(preview.hotReload.valid, true);

    // Verify impact details
    assert.equal(preview.impact.summary.oldName, "scr_player");
    assert.equal(preview.impact.summary.newName, "scr_hero");
    assert.equal(preview.impact.summary.totalOccurrences, 3);
    assert.equal(preview.impact.summary.affectedFiles.length, 2);
    assert.ok(
        preview.impact.summary.dependentSymbols.includes(
            "gml/script/scr_helper"
        )
    );

    // Verify preview content
    assert.equal(preview.preview.size, 2);
    assert.equal(
        preview.preview.get("scripts/player.gml"),
        "function scr_hero() { scr_hero(); }"
    );
    assert.equal(
        preview.preview.get("scripts/enemy.gml"),
        "var enemy = { ai: scr_hero };"
    );

    // Step 2: User confirms, commit the preview
    const writtenFiles: Record<string, string> = {};
    const result = await commitRenamePreview(engine, {
        preview,
        writeFile: async (path, content) => {
            writtenFiles[path] = content;
        }
    });

    // Verify commit results
    assert.equal(result.size, 2);
    assert.equal(
        writtenFiles["scripts/player.gml"],
        "function scr_hero() { scr_hero(); }"
    );
    assert.equal(
        writtenFiles["scripts/enemy.gml"],
        "var enemy = { ai: scr_hero };"
    );
});

void test("generateRenamePreview detects conflicts before preview", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 0, end: 7, scopeId: "scope-1" }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    // Attempt to rename to a reserved keyword
    await assert.rejects(
        () =>
            generateRenamePreview(
                engine,
                {
                    symbolId: "gml/script/scr_test",
                    newName: "if"
                },
                {
                    readFile: async () => "function scr_test() {}"
                }
            ),
        {
            message: /reserved keyword/
        }
    );
});

void test("generateRenamePreview handles empty occurrence list", async () => {
    const mockSemantic: SemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => []
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const preview = await generateRenamePreview(
        engine,
        {
            symbolId: "gml/script/scr_unused",
            newName: "scr_renamed"
        },
        {
            readFile: async () => "// empty file"
        }
    );

    // Should succeed but with no edits
    assert.equal(preview.workspace.edits.length, 0);
    assert.equal(preview.preview.size, 0);
    assert.equal(preview.impact.summary.totalOccurrences, 0);

    // Validation should pass (empty workspace is technically valid in preview context)
    // But integrity check should also pass (no old names to find)
    assert.equal(preview.integrity.valid, true);
});
