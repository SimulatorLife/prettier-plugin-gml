import assert from "node:assert/strict";
import test from "node:test";

import { Refactor, type RefactorProjectAnalysisProvider } from "../index.js";

const { RefactorEngine: RefactorEngineClass } = Refactor;

function createStubProjectAnalysisProvider(
    overrides: Partial<RefactorProjectAnalysisProvider>
): RefactorProjectAnalysisProvider {
    return {
        async isIdentifierOccupied() {
            return false;
        },
        async listIdentifierOccurrences() {
            return new Set<string>();
        },
        async planFeatherRenames(requests) {
            return requests.map((request) => ({
                identifierName: request.identifierName,
                mode: "project-aware",
                preferredReplacementName: request.preferredReplacementName,
                replacementName: request.preferredReplacementName
            }));
        },
        assessGlobalVarRewrite(_filePath, hasInitializer) {
            return {
                allowRewrite: true,
                initializerMode: hasInitializer ? "existing" : "undefined",
                mode: "project-aware"
            };
        },
        resolveLoopHoistIdentifier(preferredName) {
            return {
                identifierName: preferredName,
                mode: "project-aware"
            };
        },
        ...overrides
    };
}

void test("RefactorEngine delegates helper queries to injected project analysis provider", async () => {
    const calls: Array<string> = [];
    const provider = createStubProjectAnalysisProvider({
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
                replacementName: `${request.preferredReplacementName}_safe`
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
    });

    const engine = new RefactorEngineClass({ projectAnalysisProvider: provider });

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
                replacementName: "bar_safe"
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

void test("RefactorEngine retains cross-file transactional rename behavior", async () => {
    const semantic = {
        hasSymbol() {
            return true;
        },
        getSymbolOccurrences(name: string) {
            if (name === "scr_a") {
                return [{ path: "scripts/a.gml", start: 0, end: 5, scopeId: "scope-1" }];
            }

            if (name === "scr_b") {
                return [{ path: "scripts/b.gml", start: 2, end: 7, scopeId: "scope-2" }];
            }

            return [];
        }
    };

    const engine = new RefactorEngineClass({
        semantic,
        projectAnalysisProvider: createStubProjectAnalysisProvider({})
    });

    const plan = await engine.planBatchRename([
        { symbolId: "gml/script/scr_a", newName: "scr_new_a" },
        { symbolId: "gml/script/scr_b", newName: "scr_new_b" }
    ]);

    assert.equal(plan.edits.length, 2);
    assert.deepEqual(new Set(plan.edits.map((edit) => edit.path)), new Set(["scripts/a.gml", "scripts/b.gml"]));
});

void test("RefactorEngine preserves unsafe rename responses from shared analysis provider", async () => {
    const engine = new RefactorEngineClass({
        projectAnalysisProvider: createStubProjectAnalysisProvider({
            async planFeatherRenames(requests) {
                return requests.map((request) => ({
                    identifierName: request.identifierName,
                    mode: "project-aware",
                    preferredReplacementName: request.preferredReplacementName,
                    replacementName: null,
                    skipReason: "Identifier collides with existing project symbol"
                }));
            }
        })
    });

    const plan = await engine.planFeatherRenames(
        [
            {
                identifierName: "foo",
                preferredReplacementName: "bar"
            }
        ],
        "/tmp/project/scripts/a.gml",
        "/tmp/project"
    );

    assert.deepEqual(plan, [
        {
            identifierName: "foo",
            mode: "project-aware",
            preferredReplacementName: "bar",
            replacementName: null,
            skipReason: "Identifier collides with existing project symbol"
        }
    ]);
});

void test("RefactorEngine requires an injected project analysis provider for overlap helpers", async () => {
    const engine = new RefactorEngineClass();

    await assert.rejects(
        () => engine.isIdentifierOccupied("foo"),
        (error) => error instanceof Error && /requires an injected projectAnalysisProvider/.test(error.message)
    );
});
