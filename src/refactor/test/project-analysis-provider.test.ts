import assert from "node:assert/strict";
import test from "node:test";

import { Refactor, type RefactorProjectAnalysisProvider } from "../index.js";

const { RefactorEngine: RefactorEngineClass, createRefactorProjectAnalysisProvider } = Refactor;

void test("createRefactorProjectAnalysisProvider returns deterministic overlap defaults", () => {
    const provider = createRefactorProjectAnalysisProvider();

    const globalVarWithInitializer = provider.assessGlobalVarRewrite(null, true);
    assert.deepEqual(globalVarWithInitializer, {
        allowRewrite: true,
        initializerMode: "existing",
        mode: "project-aware"
    });

    const loopIdentifier = provider.resolveLoopHoistIdentifier("loopLength");
    assert.deepEqual(loopIdentifier, {
        identifierName: "loopLength",
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
