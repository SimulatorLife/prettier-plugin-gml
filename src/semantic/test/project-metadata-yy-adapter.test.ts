import assert from "node:assert/strict";
import test from "node:test";

import {
    isProjectMetadataParseError,
    parseProjectMetadataDocument,
    parseProjectMetadataDocumentWithSchema,
    resolveProjectMetadataSchemaName,
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

void test("resolveProjectMetadataSchemaName prefers resourceType mapping", () => {
    const schema = resolveProjectMetadataSchemaName("objects/oPlayer/oPlayer.yy", "GMScript");
    assert.equal(schema, "scripts");
});

void test("resolveProjectMetadataSchemaName falls back to source path", () => {
    const schema = resolveProjectMetadataSchemaName("rooms/room_start/room_start.yy");
    assert.equal(schema, "rooms");
});

void test("parseProjectMetadataDocumentWithSchema returns inferred schema details", () => {
    const parsed = parseProjectMetadataDocumentWithSchema(
        `{
            "name":"o_player",
            "resourceType":"GMObject",
        }`,
        "/tmp/objects/o_player/o_player.yy"
    );

    assert.equal(parsed.schemaName, "objects");
    assert.equal(parsed.document.name, "o_player");
    assert.equal(parsed.document.resourceType, "GMObject");
});
