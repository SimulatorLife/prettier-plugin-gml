import assert from "node:assert/strict";
import test from "node:test";

import { Refactor, type RefactorProjectAnalysisContext, type RefactorProjectAnalysisProvider } from "../index.js";

const { RefactorEngine: RefactorEngineClass, createRefactorProjectAnalysisProvider } = Refactor;

void test("createRefactorProjectAnalysisProvider uses shared snapshot semantics", async () => {
    const provider = createRefactorProjectAnalysisProvider();
    const context: RefactorProjectAnalysisContext = {
        semantic: {
            async getSymbolOccurrences(identifierName: string) {
                if (identifierName === "occupied") {
                    return [{ path: "/tmp/project/scripts/a.gml", start: 0, end: 1 }];
                }

                if (identifierName === "fresh") {
                    return [];
                }

                return null;
            }
        },
        async prepareRenamePlan(_request, _options) {
            return {
                workspace: new Refactor.WorkspaceEdit(),
                validation: {
                    valid: true,
                    errors: [],
                    warnings: []
                },
                hotReload: null,
                analysis: {
                    valid: true,
                    summary: {
                        symbolId: "id",
                        oldName: "old",
                        newName: "new",
                        affectedFiles: [],
                        totalOccurrences: 0,
                        definitionCount: 0,
                        referenceCount: 0,
                        hotReloadRequired: false,
                        dependentSymbols: []
                    },
                    conflicts: [],
                    warnings: []
                }
            };
        }
    };

    assert.equal(await provider.isIdentifierOccupied("occupied", context), true);
    assert.deepEqual(
        await provider.listIdentifierOccurrences("occupied", context),
        new Set(["/tmp/project/scripts/a.gml"])
    );
    assert.deepEqual(
        await provider.planFeatherRenames(
            [
                { identifierName: "occupied", preferredReplacementName: "occupied" },
                { identifierName: "occupied", preferredReplacementName: "fresh" }
            ],
            "/tmp/project/scripts/a.gml",
            "/tmp/project",
            context
        ),
        [
            {
                identifierName: "occupied",
                mode: "project-aware",
                preferredReplacementName: "occupied",
                replacementName: null,
                skipReason: "no-op-rename"
            },
            {
                identifierName: "occupied",
                mode: "project-aware",
                preferredReplacementName: "fresh",
                replacementName: "fresh"
            }
        ]
    );

    assert.deepEqual(provider.assessGlobalVarRewrite(null, true), {
        allowRewrite: false,
        initializerMode: "existing",
        mode: "project-aware"
    });
    assert.deepEqual(provider.resolveLoopHoistIdentifier("len"), {
        identifierName: "len",
        mode: "project-aware"
    });
});

void test("RefactorEngine delegates overlap helpers to injected project analysis provider", async () => {
    const calls: Array<string> = [];
    const provider: RefactorProjectAnalysisProvider = {
        async isIdentifierOccupied(identifierName) {
            calls.push(`occupied:${identifierName}`);
            return true;
        },
        async listIdentifierOccurrences(identifierName) {
            calls.push(`occurrences:${identifierName}`);
            return new Set(["/tmp/project/scripts/a.gml"]);
        },
        async planFeatherRenames(requests) {
            calls.push(`feather:${requests.length}`);
            return requests.map((request) => ({
                identifierName: request.identifierName,
                mode: "project-aware",
                preferredReplacementName: request.preferredReplacementName,
                replacementName: `${request.preferredReplacementName}_ok`
            }));
        },
        assessGlobalVarRewrite(filePath, hasInitializer) {
            calls.push(`globalvar:${filePath ?? "<none>"}:${String(hasInitializer)}`);
            return {
                allowRewrite: true,
                initializerMode: hasInitializer ? "existing" : "undefined",
                mode: "project-aware"
            };
        },
        resolveLoopHoistIdentifier(preferredName) {
            calls.push(`loop:${preferredName}`);
            return {
                identifierName: `${preferredName}_safe`,
                mode: "project-aware"
            };
        }
    };

    const engine = new RefactorEngineClass({
        projectAnalysisProvider: provider
    });

    assert.equal(await engine.isIdentifierOccupied("foo"), true);
    assert.deepEqual(await engine.listIdentifierOccurrences("foo"), new Set(["/tmp/project/scripts/a.gml"]));
    assert.deepEqual(
        await engine.planFeatherRenames(
            [
                {
                    identifierName: "foo",
                    preferredReplacementName: "bar"
                }
            ],
            "/tmp/project/scripts/a.gml",
            "/tmp/project"
        ),
        [
            {
                identifierName: "foo",
                mode: "project-aware",
                preferredReplacementName: "bar",
                replacementName: "bar_ok"
            }
        ]
    );
    assert.deepEqual(engine.assessGlobalVarRewrite("/tmp/project/scripts/a.gml", false), {
        allowRewrite: true,
        initializerMode: "undefined",
        mode: "project-aware"
    });
    assert.deepEqual(engine.resolveLoopHoistIdentifier("len"), {
        identifierName: "len_safe",
        mode: "project-aware"
    });

    assert.deepEqual(calls, [
        "occupied:foo",
        "occurrences:foo",
        "feather:1",
        "globalvar:/tmp/project/scripts/a.gml:false",
        "loop:len"
    ]);
});
