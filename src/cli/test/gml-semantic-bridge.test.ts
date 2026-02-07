import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { OccurrenceKind } from "@gml-modules/refactor";

import { GmlSemanticBridge } from "../src/modules/refactor/semantic-bridge.js";

void describe("GmlSemanticBridge tests", () => {
    void it("should find a symbol name in entry declarations even if entry name differs", () => {
        const mockProjectIndex = {
            identifiers: {
                scripts: {
                    "scope:script:scr_physics": {
                        identifierId: "gml/script/scr_physics",
                        name: "scr_physics",
                        declarations: [
                            {
                                name: "gravityFunction",
                                filePath: "scripts/scr_physics/scr_physics.gml",
                                start: { index: 100 },
                                end: { index: 115 }
                            }
                        ],
                        references: []
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const occurrences = bridge.getSymbolOccurrences("gravityFunction");

        assert.strictEqual(occurrences.length, 1, "Should have found 1 occurrence of gravityFunction");
        assert.strictEqual(occurrences[0].path, "scripts/scr_physics/scr_physics.gml");
        assert.strictEqual(occurrences[0].kind, OccurrenceKind.DEFINITION);
    });

    void it("should find references with matching targetName even if they are in unresolved entry", () => {
        const mockProjectIndex = {
            identifiers: {
                scripts: {
                    "scope:script:gravityFunction": {
                        identifierId: "gml/script/gravityFunction",
                        name: "gravityFunction",
                        declarations: [],
                        references: [
                            {
                                filePath: "objects/obj_player/Step_0.gml",
                                targetName: "gravityFunction",
                                start: { index: 50 },
                                end: { index: 65 }
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const occurrences = bridge.getSymbolOccurrences("gravityFunction");

        assert.strictEqual(occurrences.length, 1, "Should have found 1 reference to gravityFunction");
        assert.strictEqual(occurrences[0].path, "objects/obj_player/Step_0.gml");
        assert.strictEqual(occurrences[0].kind, OccurrenceKind.REFERENCE);
    });

    void it("hasSymbol should find a nested function symbol", () => {
        const mockProjectIndex = {
            identifiers: {
                scripts: {
                    "scope:script:scr_physics": {
                        identifierId: "gml/script/scr_physics",
                        name: "scr_physics",
                        declarations: [
                            {
                                name: "gravityFunction",
                                filePath: "scripts/scr_physics/scr_physics.gml",
                                start: { index: 100 },
                                end: { index: 115 }
                            }
                        ],
                        references: []
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const exists = bridge.hasSymbol("gml/script/gravityFunction");
        assert.ok(exists, "Should have found gravityFunction via hasSymbol");
    });

    void it("hasSymbol should match SCIP-style ID to internal indexer ID", () => {
        const mockProjectIndex = {
            identifiers: {
                macros: {
                    MY_MACRO: {
                        identifierId: "macro:MY_MACRO",
                        name: "MY_MACRO",
                        declarations: [{ filePath: "f1.gml", start: { index: 0 }, end: { index: 0 } }]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        assert.ok(bridge.hasSymbol("gml/macro/MY_MACRO"), "Should find macro via SCIP ID");
    });

    void it("resolveSymbolId should correctly infer kinds", () => {
        const mockProjectIndex = {
            identifiers: {
                scripts: {
                    "scope:script:func": { identifierId: "script:func", name: "func", declarations: [] }
                },
                macros: {
                    MAC: { identifierId: "macro:MAC", name: "MAC", declarations: [] }
                },
                globalVariables: {
                    glob: { identifierId: "global:glob", name: "glob", declarations: [] }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        assert.strictEqual(bridge.resolveSymbolId("func"), "gml/script/func");
        assert.strictEqual(bridge.resolveSymbolId("MAC"), "gml/macro/MAC");
        assert.strictEqual(bridge.resolveSymbolId("glob"), "gml/var/glob");
    });

    void it("should handle missing identifiers property by falling back to identifierCollections", () => {
        // Simulate a ProjectIndex where 'identifiers' is missing but 'identifierCollections' is present
        const mockProjectIndex = {
            // No identifiers property
            identifierCollections: {
                scripts: {
                    "scope:script:func": { identifierId: "script:func", name: "func", declarations: [] }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        assert.strictEqual(bridge.resolveSymbolId("func"), "gml/script/func");
        assert.ok(bridge.hasSymbol("gml/script/func"));
    });
    void it("resolveSymbolId should match case-insensitively", () => {
        const mockProjectIndex = {
            identifiers: {
                scripts: {
                    "scope:script:GravityFunction": {
                        identifierId: "script:GravityFunction",
                        name: "GravityFunction",
                        declarations: []
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        // User types "gravityFunction" (lowercase), index has "GravityFunction"
        assert.strictEqual(bridge.resolveSymbolId("gravityFunction"), "gml/script/GravityFunction");
    });

    void it("hasSymbol should find an object resource in the resources map", () => {
        const mockProjectIndex = {
            identifiers: {},
            resources: {
                "objects/oGravitySphere/oGravitySphere.yy": {
                    path: "objects/oGravitySphere/oGravitySphere.yy",
                    name: "oGravitySphere",
                    resourceType: "GMObject",
                    assetReferences: []
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        assert.ok(bridge.hasSymbol("gml/objects/oGravitySphere"), "Should find object resource via hasSymbol");

        // Also test case insensitivity
        assert.ok(bridge.hasSymbol("gml/objects/ogravitysphere"), "Should find object resource case-insensitively");
    });

    void it("getAdditionalSymbolEdits rewrites yy metadata using structured updates", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-"));
        const resourcePath = "objects/oGravitySphere/oGravitySphere.yy";
        const refPath = "objects/oRef/oRef.yy";

        const resourceAbsolute = path.join(tmpRoot, resourcePath);
        const refAbsolute = path.join(tmpRoot, refPath);
        fs.mkdirSync(path.dirname(resourceAbsolute), { recursive: true });
        fs.mkdirSync(path.dirname(refAbsolute), { recursive: true });

        fs.writeFileSync(
            resourceAbsolute,
            `{"name":"oGravitySphere","resourceType":"GMObject","resourcePath":"objects/oGravitySphere/oGravitySphere.yy",}`,
            "utf8"
        );
        fs.writeFileSync(
            refAbsolute,
            `{"name":"oRef","resourceType":"GMObject","spriteId":{"name":"oGravitySphere","path":"objects/oGravitySphere/oGravitySphere.yy",},}`,
            "utf8"
        );

        const mockProjectIndex = {
            identifiers: {},
            resources: {
                [resourcePath]: {
                    path: resourcePath,
                    name: "oGravitySphere",
                    resourceType: "GMObject",
                    assetReferences: []
                },
                [refPath]: {
                    path: refPath,
                    name: "oRef",
                    resourceType: "GMObject",
                    assetReferences: [
                        {
                            propertyPath: "spriteId",
                            targetPath: resourcePath,
                            targetName: "oGravitySphere"
                        }
                    ]
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const edits = bridge.getAdditionalSymbolEdits("gml/objects/oGravitySphere", "oGravityWell");

        assert.ok(edits, "Expected additional edits for resource rename");
        assert.ok(edits.edits.some((entry) => entry.path === resourcePath));
        assert.ok(edits.edits.some((entry) => entry.path === refPath));

        const referenceEdit = edits.edits.find((entry) => entry.path === refPath);
        assert.ok(referenceEdit);
        assert.match(referenceEdit.newText, /"name"\s*:\s*"oGravityWell"/);
        assert.match(referenceEdit.newText, /"path"\s*:\s*"objects\/oGravitySphere\/oGravityWell\.yy"/);
    });
});
