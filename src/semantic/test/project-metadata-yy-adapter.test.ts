import assert from "node:assert/strict";
import test from "node:test";

import {
    getProjectMetadataValueAtPath,
    isProjectMetadataParseError,
    isProjectMetadataSchemaValidationError,
    parseProjectMetadataDocument,
    parseProjectMetadataDocumentForMutation,
    parseProjectMetadataDocumentWithSchema,
    resolveProjectMetadataSchemaName,
    stringifyProjectMetadataDocument,
    updateProjectMetadataReferenceByPath
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

void test("resolveProjectMetadataSchemaName infers schema names from absolute metadata paths", () => {
    const schema = resolveProjectMetadataSchemaName("/tmp/project/objects/o_player/o_player.yy");
    assert.equal(schema, "objects");
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
    assert.equal(parsed.schemaValidated, true);
    assert.equal(parsed.document.name, "o_player");
    assert.equal(parsed.document.resourceType, "GMObject");
});

void test("parseProjectMetadataDocumentWithSchema reports schema validation failures", () => {
    const parsed = parseProjectMetadataDocumentWithSchema(
        `{
            "name":"o_player",
            "resourceType":"GMObject",
            "eventList":"invalid",
        }`,
        "/tmp/objects/o_player/o_player.yy"
    );

    assert.equal(parsed.schemaName, "objects");
    assert.equal(parsed.schemaValidated, false);
    assert.ok(parsed.schemaError);
    assert.equal(parsed.document.name, "o_player");
    assert.equal(parsed.document.resourceType, "GMObject");
});

void test("parseProjectMetadataDocumentForMutation enforces inferred schema validation", () => {
    let caught: unknown;
    try {
        parseProjectMetadataDocumentForMutation(
            `{
                "name":"o_player",
                "resourceType":"GMObject",
                "eventList":"invalid",
            }`,
            "/tmp/objects/o_player/o_player.yy"
        );
    } catch (error) {
        caught = error;
    }

    assert.ok(isProjectMetadataSchemaValidationError(caught));
});

void test("parseProjectMetadataDocumentForMutation allows loose project manifest parsing", () => {
    const parsed = parseProjectMetadataDocumentForMutation(
        `{
            "name":"MyProject",
            "resourceType":"GMProject",
            "resources":[{"id":{"name":"o_player","path":"objects/o_player/o_player.yy",}}],
        }`,
        "/tmp/project.yyp"
    );

    assert.equal(parsed.schemaName, "project");
    assert.equal(parsed.schemaValidated, false);
    assert.equal(parsed.document.resourceType, "GMProject");
});

void test("updateProjectMetadataReferenceByPath updates object references", () => {
    const document: Record<string, unknown> = {
        spriteId: {
            name: "spr_player",
            path: "sprites/spr_player/spr_player.yy"
        }
    };

    const changed = updateProjectMetadataReferenceByPath({
        document,
        propertyPath: "spriteId",
        newResourcePath: "sprites/spr_hero/spr_hero.yy",
        newName: "spr_hero"
    });

    assert.equal(changed, true);
    assert.deepEqual(document.spriteId, {
        name: "spr_hero",
        path: "sprites/spr_hero/spr_hero.yy"
    });
});

void test("updateProjectMetadataReferenceByPath updates direct string paths", () => {
    const document: Record<string, unknown> = {
        Folders: [
            {
                name: "Scripts",
                folderPath: "folders/Scripts.yy"
            }
        ]
    };

    const changed = updateProjectMetadataReferenceByPath({
        document,
        propertyPath: "Folders.0.folderPath",
        newResourcePath: "folders/Code.yy",
        newName: null
    });

    assert.equal(changed, true);
    assert.equal(getProjectMetadataValueAtPath(document, "Folders.0.folderPath"), "folders/Code.yy");
});
