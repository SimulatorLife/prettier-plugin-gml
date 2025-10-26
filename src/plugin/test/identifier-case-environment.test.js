import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
    prepareIdentifierCaseEnvironment,
    teardownIdentifierCaseEnvironment
} from "../src/identifier-case/environment.js";
import { gmlParserAdapter } from "../src/parsers/gml-parser-adapter.js";
import { clearIdentifierCaseOptionStore } from "../src/identifier-case/option-store.js";

function createBootstrap(dispose) {
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

test("identifier case bootstrap disposes when the environment is torn down", async () => {
    let disposeCount = 0;
    const filepath = path.join("/virtual/project", "script.gml");
    const bootstrap = createBootstrap(() => {
        disposeCount += 1;
    });

    const options = {
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

test("identifier case bootstrap is disposed when parsing fails", async () => {
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

    const options = {
        filepath,
        __identifierCasePlanGeneratedInternally: true,
        __identifierCaseProjectIndexBootstrap: bootstrap
    };

    await assert.rejects(() => gmlParserAdapter.parse("if (", options));

    assert.equal(disposeCalls, 1);

    clearIdentifierCaseOptionStore(filepath);
});
