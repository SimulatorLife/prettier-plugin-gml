import assert from "node:assert/strict";
import test from "node:test";

import {
    isProjectMetadataParseError,
    parseProjectMetadataDocument,
    stringifyProjectMetadataDocument
} from "../src/project-metadata/yy-adapter.js";

void test("parseProjectMetadataDocument accepts trailing commas", () => {
    const parsed = parseProjectMetadataDocument(
        `{
            "name":"scr_demo",
            "resourceType":"GMScript",
        }`,
        "/tmp/scripts/scr_demo/scr_demo.yy"
    );

    assert.equal(parsed.name, "scr_demo");
    assert.equal(parsed.resourceType, "GMScript");
});

void test("parseProjectMetadataDocument returns parse errors with dedicated type", () => {
    let caught: unknown;
    try {
        parseProjectMetadataDocument("{ invalid", "/tmp/scripts/scr_demo/scr_demo.yy");
    } catch (error) {
        caught = error;
    }

    assert.ok(isProjectMetadataParseError(caught));
});

void test("stringifyProjectMetadataDocument emits GameMaker-compatible output", () => {
    const output = stringifyProjectMetadataDocument({
        name: "scr_demo",
        resourceType: "GMScript"
    });

    assert.match(output, /"name"\s*:\s*"scr_demo"/);
    assert.match(output, /"resourceType"\s*:\s*"GMScript"/);
});
