import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Semantic } from "@gml-modules/semantic";
import { Plugin } from "../index.js";

const {
    prepareIdentifierCaseEnvironment,
    teardownIdentifierCaseEnvironment,
    clearIdentifierCaseOptionStore
} = Semantic;

function createBootstrap(dispose: any) {
    return {
        status: "ready",
        reason: "provided",
        projectRoot: "/virtual/project",
        projectIndex: {},
        source: "provided",
        cache: null,
        dispose
    };
}

void test("identifier case bootstrap disposes when the environment is torn down", async () => {
    let disposeCount = 0;
    const filepath = path.join("/virtual/project", "script.gml");
    const bootstrap = createBootstrap(() => {
        disposeCount += 1;
    });

    const options: any = {
        filepath,
        __identifierCasePlanGeneratedInternally: true,
        __identifierCaseProjectIndexBootstrap: bootstrap,
        identifierCaseDryRun: false,
        __identifierCaseDryRun: false
    };

    await prepareIdentifierCaseEnvironment(options);
    teardownIdentifierCaseEnvironment(options);

    assert.equal(disposeCount, 1, "Expected bootstrap dispose to run once");

    clearIdentifierCaseOptionStore(filepath);
});

void test("identifier case bootstrap is disposed when parsing fails", async () => {
    let disposeCalls = 0;
    const filepath = path.join("/virtual/project", "leaky.gml");
    const bootstrap = {
        status: "ready",
        reason: "provided",
        projectRoot: "/virtual/project",
        projectIndex: {},
        source: "provided",
        cache: null,
        dispose() {
            disposeCalls += 1;
        }
    };

    const options: any = {
        filepath,
        __identifierCasePlanGeneratedInternally: true,
        __identifierCaseProjectIndexBootstrap: bootstrap
    };

    await assert.rejects(
        Plugin.parsers.gmlParserAdapter.parse(
            "if (",
            options
        ) as Promise<unknown>,
        (error) =>
            typeof error === "object" &&
            error !== null &&
            (error as { name?: string }).name === "GameMakerSyntaxError"
    );

    assert.equal(disposeCalls, 1);

    clearIdentifierCaseOptionStore(filepath);
});
