import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Plugin } from "../index.js";

type DisposableBootstrap = {
    dispose: () => void;
};

type IdentifierCaseTestOptions = {
    filepath: string;
    __identifierCasePlanGeneratedInternally: boolean;
    __identifierCaseProjectIndexBootstrap: DisposableBootstrap;
    identifierCaseDryRun?: boolean;
    __identifierCaseDryRun?: boolean;
};

async function prepareIdentifierCaseEnvironment(_options?: IdentifierCaseTestOptions): Promise<void> {}

function teardownIdentifierCaseEnvironment(options?: IdentifierCaseTestOptions): void {
    options?.__identifierCaseProjectIndexBootstrap.dispose();
}

Plugin.configureIdentifierCaseIntegration({
    runtime: {
        createScopeTracker: () => null,
        prepareIdentifierCaseEnvironment,
        teardownIdentifierCaseEnvironment,
        attachIdentifierCasePlanSnapshot: () => {}
    }
});

function createBootstrap(dispose: () => void) {
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

    const options: IdentifierCaseTestOptions = {
        filepath,
        __identifierCasePlanGeneratedInternally: true,
        __identifierCaseProjectIndexBootstrap: bootstrap,
        identifierCaseDryRun: false,
        __identifierCaseDryRun: false
    };

    await prepareIdentifierCaseEnvironment(options);
    teardownIdentifierCaseEnvironment(options);

    assert.equal(disposeCount, 1, "Expected bootstrap dispose to run once");
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

    const options: IdentifierCaseTestOptions = {
        filepath,
        __identifierCasePlanGeneratedInternally: true,
        __identifierCaseProjectIndexBootstrap: bootstrap
    };
    const parserOptions = options as unknown as Parameters<typeof Plugin.parsers.gmlParserAdapter.parse>[1];

    await assert.rejects(
        Plugin.parsers.gmlParserAdapter.parse("if (", parserOptions) as Promise<unknown>,
        (error) =>
            typeof error === "object" && error !== null && (error as { name?: string }).name === "GameMakerSyntaxError"
    );

    assert.equal(disposeCalls, 1);
});
