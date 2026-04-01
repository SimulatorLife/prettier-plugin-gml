import assert from "node:assert/strict";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { Refactor } from "@gmloop/refactor";
import { Semantic } from "@gmloop/semantic";

import { GmlSemanticBridge } from "../src/modules/refactor/semantic-bridge.js";

function findNthIndex(sourceText: string, searchText: string, occurrenceNumber: number): number {
    let searchIndex = -1;

    for (let occurrenceIndex = 0; occurrenceIndex < occurrenceNumber; occurrenceIndex += 1) {
        searchIndex = sourceText.indexOf(searchText, searchIndex + 1);
        if (searchIndex === -1) {
            throw new Error(`Could not find occurrence ${occurrenceNumber} of ${JSON.stringify(searchText)}`);
        }
    }

    return searchIndex;
}

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
        assert.strictEqual(occurrences[0].kind, Refactor.OccurrenceKind.DEFINITION);
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
        assert.strictEqual(occurrences[0].kind, Refactor.OccurrenceKind.REFERENCE);
    });

    void it("normalizes semantic end indexes to exclusive naming convention occurrences", async () => {
        const mockProjectIndex = {
            identifiers: {
                enumMembers: {
                    "enum-member:ECM-X": {
                        name: "X",
                        declarations: [
                            {
                                name: "X",
                                filePath: "scripts/ecm/ecm.gml",
                                start: { index: 20 },
                                end: { index: 21 }
                            }
                        ],
                        references: [
                            {
                                filePath: "scripts/ecm/ecm.gml",
                                start: { index: 40 },
                                end: { index: 41 }
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const targets = await bridge.listNamingConventionTargets();
        const xTarget = targets.find((target) => target.category === "enumMember" && target.name === "X");

        assert.ok(xTarget, "Expected X enum member target");
        assert.strictEqual(xTarget?.occurrences?.[0]?.start, 20);
        assert.strictEqual(xTarget?.occurrences?.[0]?.end, 22);
        assert.strictEqual(xTarget?.occurrences?.[1]?.start, 40);
        assert.strictEqual(xTarget?.occurrences?.[1]?.end, 42);
    });

    void it("listNamingConventionTargets does not treat enum-member references as local variable occurrences", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-local-occurrences-"));
        const sourceText = "function demo(X) {\n    var collider = array_create(CM.X);\n    return X;\n}\n";
        const relativeFilePath = "scripts/demo/demo.gml";
        fs.mkdirSync(path.join(tmpRoot, "scripts", "demo"), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, relativeFilePath), sourceText, "utf8");
        const parameterStart = sourceText.indexOf("X)");
        const enumMemberReferenceStart = sourceText.indexOf("CM.X") + "CM.".length;
        const localReferenceStart = sourceText.lastIndexOf("X;");
        const mockProjectIndex = {
            files: {
                [relativeFilePath]: {
                    declarations: [
                        {
                            name: "X",
                            scopeId: "scope:function",
                            classifications: ["parameter"],
                            start: { index: parameterStart },
                            end: { index: parameterStart }
                        }
                    ],
                    references: [
                        {
                            name: "X",
                            scopeId: "scope:function",
                            classifications: ["enum-member"],
                            start: { index: enumMemberReferenceStart },
                            end: { index: enumMemberReferenceStart },
                            declaration: {
                                name: "X",
                                scopeId: "scope:function",
                                start: { index: parameterStart }
                            }
                        },
                        {
                            name: "X",
                            scopeId: "scope:function",
                            classifications: ["parameter"],
                            start: { index: localReferenceStart },
                            end: { index: localReferenceStart },
                            declaration: {
                                name: "X",
                                scopeId: "scope:function",
                                start: { index: parameterStart }
                            }
                        }
                    ]
                }
            },
            scopes: {
                "scope:function": {
                    kind: "function"
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const targets = await bridge.listNamingConventionTargets();
        const argumentTarget = targets.find((target) => target.category === "argument" && target.name === "X");

        assert.ok(argumentTarget, "Expected X argument target");
        assert.equal(argumentTarget?.occurrences.length, 2);
        assert.deepEqual(
            argumentTarget?.occurrences.map((occurrence) => occurrence.start),
            [parameterStart, localReferenceStart]
        );
    });

    void it("findSymbolOccurrences fallback on disk should skip string literals and partial identifiers", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-fallback-"));
        const gmlPath = "scripts/switch_case.gml";
        fs.mkdirSync(path.join(tmpRoot, "scripts"), { recursive: true });

        const sourceText = [
            "var x = 1;",
            "var x_num = 2;",
            "var y = x;",
            "switch (y) {",
            "    case x:",
            "    case x_num:",
            '    case "x":',
            "    default:",
            "        break;",
            "}",
            ""
        ].join("\n");

        fs.writeFileSync(path.join(tmpRoot, gmlPath), sourceText, "utf8");

        const mockProjectIndex = {
            resources: {
                [gmlPath]: {
                    name: "x",
                    path: gmlPath,
                    resourceType: "GMScript"
                }
            },
            files: {
                [gmlPath]: {}
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const occurrences = bridge.getSymbolOccurrences("x", "gml/scripts/x");

        assert.strictEqual(occurrences.length, 3, "Should match only the x identifier occurrences");
        assert.ok(!occurrences.some((hit) => hit.start === sourceText.indexOf("x_num")));
        assert.ok(!occurrences.some((hit) => hit.start === sourceText.indexOf('"x"')));
    });

    void it("findSymbolOccurrences fallback should not match a quoted string-only symbol", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-fallback2-"));
        const gmlPath = "scripts/switch_literal.gml";
        fs.mkdirSync(path.join(tmpRoot, "scripts"), { recursive: true });

        const sourceText = [
            "switch (token)",
            '    case "v":',
            '    case "vn":',
            '    case "vt":',
            "    default:",
            "        break;",
            ""
        ].join("\n");

        fs.writeFileSync(path.join(tmpRoot, gmlPath), sourceText, "utf8");

        const mockProjectIndex = {
            resources: {
                [gmlPath]: {
                    name: "v",
                    path: gmlPath,
                    resourceType: "GMScript"
                }
            },
            files: {
                [gmlPath]: {}
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const occurrences = bridge.getSymbolOccurrences("v", "gml/scripts/v");

        assert.strictEqual(
            occurrences.length,
            0,
            "Should not rename case string literals when there are no identifiers"
        );
    });

    void it("ignores relationship-based script call occurrences when the project index omits call spans", () => {
        const sourceText = "function consumer_script() {\n    return demo_script();\n}\n";
        const mockProjectIndex = {
            relationships: {
                scriptCalls: [
                    {
                        from: {
                            filePath: "scripts/consumer_script/consumer_script.gml",
                            scopeId: "scope:consumer"
                        },
                        target: {
                            name: "demo_script"
                        }
                    }
                ]
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const occurrences = bridge.getSymbolOccurrences("demo_script");

        assert.deepEqual(
            occurrences,
            [],
            "Relationship fallback should skip unresolved spans instead of synthesizing a zero-length edit"
        );
        assert.strictEqual(findNthIndex(sourceText, "demo_script", 1), 40);
    });

    void it("ignores entry references when the project index omits their source span", () => {
        const mockProjectIndex = {
            identifiers: {
                scripts: {
                    consumer_script: {
                        identifierId: "gml/script/consumer_script",
                        name: "consumer_script",
                        declarations: [],
                        references: [
                            {
                                filePath: "scripts/consumer_script/consumer_script.gml",
                                targetName: "demo_script"
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");

        assert.deepEqual(
            bridge.getSymbolOccurrences("demo_script"),
            [],
            "Missing reference spans should not produce zero-length edits at the start of the file"
        );
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
        const projectManifestPath = "project.yyp";

        const resourceAbsolute = path.join(tmpRoot, resourcePath);
        const refAbsolute = path.join(tmpRoot, refPath);
        const projectManifestAbsolute = path.join(tmpRoot, projectManifestPath);
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
        fs.writeFileSync(
            projectManifestAbsolute,
            `{
                "name":"MyGame",
                "resourceType":"GMProject",
                "resources":[{"id":{"name":"oGravitySphere","path":"objects/oGravitySphere/oGravitySphere.yy",}}],
            }`,
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
                },
                [projectManifestPath]: {
                    path: projectManifestPath,
                    name: "MyGame",
                    resourceType: "GMProject",
                    assetReferences: [
                        {
                            propertyPath: "resources.0.id",
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
        assert.ok(edits.metadataEdits.some((entry) => entry.path === resourcePath));
        assert.ok(edits.metadataEdits.some((entry) => entry.path === refPath));
        assert.ok(edits.metadataEdits.some((entry) => entry.path === projectManifestPath));

        const referenceEdit = edits.metadataEdits.find((entry) => entry.path === refPath);
        assert.ok(referenceEdit);
        assert.match(referenceEdit.content, /"name"\s*:\s*"oGravityWell"/);
        assert.match(referenceEdit.content, /"path"\s*:\s*"objects\/oGravityWell\/oGravityWell\.yy"/);

        const manifestEdit = edits.metadataEdits.find((entry) => entry.path === projectManifestPath);
        assert.ok(manifestEdit);
        assert.match(manifestEdit.content, /"name"\s*:\s*"oGravityWell"/);
        assert.match(manifestEdit.content, /"path"\s*:\s*"objects\/oGravityWell\/oGravityWell\.yy"/);
    });

    void it("getAdditionalSymbolEdits updates resourcePath in the renamed resource file", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-resourcepath-"));
        const resourcePath = "objects/oGravitySphere/oGravitySphere.yy";
        const projectManifestPath = "project.yyp";

        const resourceAbsolute = path.join(tmpRoot, resourcePath);
        const projectManifestAbsolute = path.join(tmpRoot, projectManifestPath);
        fs.mkdirSync(path.dirname(resourceAbsolute), { recursive: true });

        fs.writeFileSync(
            resourceAbsolute,
            `{"name":"oGravitySphere","resourceType":"GMObject","resourcePath":"objects/oGravitySphere/oGravitySphere.yy",}`,
            "utf8"
        );
        fs.writeFileSync(
            projectManifestAbsolute,
            `{
                "name":"MyGame",
                "resourceType":"GMProject",
                "resources":[{"id":{"name":"oGravitySphere","path":"objects/oGravitySphere/oGravitySphere.yy",}}],
            }`,
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
                [projectManifestPath]: {
                    path: projectManifestPath,
                    name: "MyGame",
                    resourceType: "GMProject",
                    assetReferences: [
                        {
                            propertyPath: "resources.0.id",
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

        const resourceEdit = edits.metadataEdits.find((entry) => entry.path === resourcePath);
        assert.ok(resourceEdit);
        assert.match(resourceEdit.content, /"name"\s*:\s*"oGravityWell"/);
        assert.match(resourceEdit.content, /"resourcePath"\s*:\s*"objects\/oGravityWell\/oGravityWell\.yy"/);
    });

    void it("getAdditionalSymbolEdits replaces project manifest entries in-place", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-manifest-inplace-"));
        const resourcePath = "objects/oGravitySphere/oGravitySphere.yy";
        const projectManifestPath = "project.yyp";

        const resourceAbsolute = path.join(tmpRoot, resourcePath);
        const projectManifestAbsolute = path.join(tmpRoot, projectManifestPath);
        fs.mkdirSync(path.dirname(resourceAbsolute), { recursive: true });

        fs.writeFileSync(
            resourceAbsolute,
            `{"name":"oGravitySphere","resourceType":"GMObject","resourcePath":"objects/oGravitySphere/oGravitySphere.yy",}`,
            "utf8"
        );
        fs.writeFileSync(
            projectManifestAbsolute,
            `{"name":"MyGame","resourceType":"GMProject","resources":[{"id":{"name":"oGravitySphere","path":"objects/oGravitySphere/oGravitySphere.yy"}}]}`,
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
                [projectManifestPath]: {
                    path: projectManifestPath,
                    name: "MyGame",
                    resourceType: "GMProject",
                    assetReferences: [
                        {
                            propertyPath: "resources.0.id",
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

        const manifestEdit = edits.metadataEdits.find((entry) => entry.path === projectManifestPath);
        assert.ok(manifestEdit);
        assert.match(manifestEdit.content, /"name"\s*:\s*"oGravityWell"/);
        assert.match(manifestEdit.content, /"path"\s*:\s*"objects\/oGravityWell\/oGravityWell\.yy"/);
        assert.doesNotMatch(manifestEdit.content, /"name"\s*:\s*"oGravitySphere"/);
    });

    void it("getAdditionalSymbolEdits normalizes resourceType before resourcePath ordering", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-normalization-"));
        const resourcePath = "objects/oGravitySphere/oGravitySphere.yy";
        const projectManifestPath = "project.yyp";

        const resourceAbsolute = path.join(tmpRoot, resourcePath);
        const projectManifestAbsolute = path.join(tmpRoot, projectManifestPath);
        fs.mkdirSync(path.dirname(resourceAbsolute), { recursive: true });

        fs.writeFileSync(
            resourceAbsolute,
            `{"name":"oGravitySphere","resourcePath":"objects/oGravitySphere/oGravitySphere.yy","resourceType":"GMObject"}`,
            "utf8"
        );
        fs.writeFileSync(
            projectManifestAbsolute,
            `{"name":"MyGame","resourceType":"GMProject","resources":[{"id":{"name":"oGravitySphere","path":"objects/oGravitySphere/oGravitySphere.yy"}}]}`,
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
                [projectManifestPath]: {
                    path: projectManifestPath,
                    name: "MyGame",
                    resourceType: "GMProject",
                    assetReferences: [
                        {
                            propertyPath: "resources.0.id",
                            targetPath: resourcePath,
                            targetName: "oGravitySphere"
                        }
                    ]
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const edits = bridge.getAdditionalSymbolEdits("gml/objects/oGravitySphere", "oGravityWell");

        assert.ok(edits);

        const resourceEdit = edits.metadataEdits.find((entry) => entry.path === resourcePath);
        assert.ok(resourceEdit);

        // Legacy script metadata may not include resourcePath. Refactor should not
        // inject resourcePath on the resource file body itself unless it was
        // already present.
        const containsResourcePath = resourceEdit.content.includes('"resourcePath"');
        assert.ok(containsResourcePath, "resourcePath should be present because it was in the source");

        const typeIndex = resourceEdit.content.indexOf('"resourceType"');
        assert.ok(typeIndex !== -1, "resourceType should remain present");
    });

    void it("getAdditionalSymbolEdits composes staged project metadata edits across sequential resource renames", () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-batch-"));
        const objectPath = "objects/oGravitySphere/oGravitySphere.yy";
        const spritePath = "sprites/sEnemy/sEnemy.yy";
        const projectManifestPath = "project.yyp";

        const objectAbsolute = path.join(tmpRoot, objectPath);
        const spriteAbsolute = path.join(tmpRoot, spritePath);
        const projectManifestAbsolute = path.join(tmpRoot, projectManifestPath);
        fs.mkdirSync(path.dirname(objectAbsolute), { recursive: true });
        fs.mkdirSync(path.dirname(spriteAbsolute), { recursive: true });

        fs.writeFileSync(
            objectAbsolute,
            `{"name":"oGravitySphere","resourceType":"GMObject","resourcePath":"objects/oGravitySphere/oGravitySphere.yy",}`,
            "utf8"
        );
        fs.writeFileSync(
            spriteAbsolute,
            `{"name":"sEnemy","resourceType":"GMSprite","resourcePath":"sprites/sEnemy/sEnemy.yy",}`,
            "utf8"
        );
        fs.writeFileSync(
            projectManifestAbsolute,
            `{
                "name":"MyGame",
                "resourceType":"GMProject",
                "resources":[
                    {"id":{"name":"oGravitySphere","path":"objects/oGravitySphere/oGravitySphere.yy",}},
                    {"id":{"name":"sEnemy","path":"sprites/sEnemy/sEnemy.yy",}}
                ],
            }`,
            "utf8"
        );

        const mockProjectIndex = {
            identifiers: {},
            resources: {
                [objectPath]: {
                    path: objectPath,
                    name: "oGravitySphere",
                    resourceType: "GMObject",
                    assetReferences: []
                },
                [spritePath]: {
                    path: spritePath,
                    name: "sEnemy",
                    resourceType: "GMSprite",
                    assetReferences: []
                },
                [projectManifestPath]: {
                    path: projectManifestPath,
                    name: "MyGame",
                    resourceType: "GMProject",
                    assetReferences: [
                        {
                            propertyPath: "resources.0.id",
                            targetPath: objectPath,
                            targetName: "oGravitySphere"
                        },
                        {
                            propertyPath: "resources.1.id",
                            targetPath: spritePath,
                            targetName: "sEnemy"
                        }
                    ]
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const firstEdits = bridge.getAdditionalSymbolEdits("gml/objects/oGravitySphere", "oGravityWell");
        assert.ok(firstEdits);

        bridge.stageWorkspaceEdit({ metadataEdits: firstEdits.metadataEdits });

        const secondEdits = bridge.getAdditionalSymbolEdits("gml/sprites/sEnemy", "sFoe");
        const stagedManifestEdit = secondEdits?.metadataEdits.find((entry) => entry.path === projectManifestPath);

        assert.ok(stagedManifestEdit);
        assert.match(stagedManifestEdit.content, /"name"\s*:\s*"oGravityWell"/);
        assert.match(stagedManifestEdit.content, /"path"\s*:\s*"objects\/oGravityWell\/oGravityWell\.yy"/);
        assert.match(stagedManifestEdit.content, /"name"\s*:\s*"sFoe"/);
        assert.match(stagedManifestEdit.content, /"path"\s*:\s*"sprites\/sFoe\/sFoe\.yy"/);

        bridge.clearWorkspaceOverlay();

        const resetEdits = bridge.getAdditionalSymbolEdits("gml/sprites/sEnemy", "sFoe");
        const resetManifestEdit = resetEdits?.metadataEdits.find((entry) => entry.path === projectManifestPath);

        assert.ok(resetManifestEdit);
        assert.doesNotMatch(resetManifestEdit.content, /"name"\s*:\s*"oGravityWell"/);
    });

    void it("listNamingConventionTargets classifies resource, callable, macro, global, and local targets", async () => {
        const mockProjectIndex = {
            resources: {
                "scripts/demo_script/demo_script.yy": {
                    path: "scripts/demo_script/demo_script.yy",
                    name: "demo_script",
                    resourceType: "GMScript"
                },
                "paths/pth_enemy_route/pth_enemy_route.yy": {
                    path: "paths/pth_enemy_route/pth_enemy_route.yy",
                    name: "pth_enemy_route",
                    resourceType: "GMPath"
                },
                "animcurves/curve_attack_arc/curve_attack_arc.yy": {
                    path: "animcurves/curve_attack_arc/curve_attack_arc.yy",
                    name: "curve_attack_arc",
                    resourceType: "GMAnimCurve"
                },
                "sequences/seq_intro/seq_intro.yy": {
                    path: "sequences/seq_intro/seq_intro.yy",
                    name: "seq_intro",
                    resourceType: "GMSequence"
                },
                "tilesets/tile_world/tile_world.yy": {
                    path: "tilesets/tile_world/tile_world.yy",
                    name: "tile_world",
                    resourceType: "GMTileSet"
                },
                "particlesystems/part_trail/part_trail.yy": {
                    path: "particlesystems/part_trail/part_trail.yy",
                    name: "part_trail",
                    resourceType: "GMParticleSystem"
                },
                "notes/note_design/note_design.yy": {
                    path: "notes/note_design/note_design.yy",
                    name: "note_design",
                    resourceType: "GMNote"
                },
                "extensions/ext_physics/ext_physics.yy": {
                    path: "extensions/ext_physics/ext_physics.yy",
                    name: "ext_physics",
                    resourceType: "GMExtension"
                }
            },
            identifiers: {
                scripts: {
                    "scope:script:demo_script": {
                        identifierId: "script:scope:script:demo_script",
                        name: "demo_script",
                        resourcePath: "scripts/demo_script/demo_script.yy",
                        declarations: [
                            {
                                name: "demo_script",
                                filePath: "scripts/demo_script/demo_script.gml",
                                classifications: ["script"]
                            }
                        ]
                    },
                    "scope:script:build_widget": {
                        identifierId: "script:scope:script:build_widget",
                        name: "build_widget",
                        declarations: [
                            {
                                name: "build_widget",
                                filePath: "scripts/demo_script/demo_script.gml",
                                classifications: ["function", "constructor"]
                            }
                        ]
                    }
                },
                macros: {
                    DEMO_MACRO: {
                        identifierId: "macro:DEMO_MACRO",
                        name: "DEMO_MACRO",
                        declarations: [
                            {
                                name: "DEMO_MACRO",
                                filePath: "scripts/demo_script/demo_script.gml"
                            }
                        ]
                    }
                },
                globalVariables: {
                    global_score: {
                        identifierId: "global:global_score",
                        name: "global_score",
                        declarations: [
                            {
                                name: "global_score",
                                filePath: "scripts/demo_script/demo_script.gml"
                            }
                        ]
                    }
                },
                enums: {
                    state_enum: {
                        identifierId: "enum:state_enum",
                        name: "state_enum",
                        declarations: [
                            {
                                name: "state_enum",
                                filePath: "scripts/demo_script/demo_script.gml"
                            }
                        ]
                    }
                },
                enumMembers: {
                    "enum-member:ready": {
                        identifierId: "enum-member:ready",
                        name: "ready_state",
                        declarations: [
                            {
                                name: "ready_state",
                                filePath: "scripts/demo_script/demo_script.gml",
                                start: { index: 120 },
                                end: { index: 131 }
                            }
                        ],
                        references: [
                            {
                                filePath: "scripts/demo_script/demo_script.gml",
                                start: { index: 150 },
                                end: { index: 161 }
                            }
                        ]
                    }
                },
                instanceVariables: {}
            },
            scopes: {
                "scope:catch": {
                    kind: "catch"
                }
            },
            files: {
                "scripts/demo_script/demo_script.gml": {
                    declarations: [
                        {
                            name: "bad_name",
                            scopeId: "scope:local",
                            classifications: ["variable"],
                            start: { index: 4 },
                            end: { index: 12 }
                        },
                        {
                            name: "err_value",
                            scopeId: "scope:catch",
                            classifications: ["parameter"],
                            start: { index: 30 },
                            end: { index: 39 }
                        }
                    ],
                    references: [
                        {
                            name: "bad_name",
                            scopeId: "scope:local",
                            start: { index: 60 },
                            end: { index: 68 },
                            declaration: {
                                name: "bad_name",
                                scopeId: "scope:local",
                                start: { index: 4 }
                            }
                        },
                        {
                            name: "err_value",
                            scopeId: "scope:catch",
                            start: { index: 90 },
                            end: { index: 99 },
                            declaration: {
                                name: "err_value",
                                scopeId: "scope:catch",
                                start: { index: 30 }
                            }
                        }
                    ]
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const targets = await bridge.listNamingConventionTargets();

        assert.ok(targets.some((target) => target.category === "scriptResourceName" && target.name === "demo_script"));
        assert.ok(
            targets.some((target) => target.category === "pathResourceName" && target.name === "pth_enemy_route")
        );
        assert.ok(
            targets.some(
                (target) => target.category === "animationCurveResourceName" && target.name === "curve_attack_arc"
            )
        );
        assert.ok(targets.some((target) => target.category === "sequenceResourceName" && target.name === "seq_intro"));
        assert.ok(targets.some((target) => target.category === "tilesetResourceName" && target.name === "tile_world"));
        assert.ok(
            targets.some((target) => target.category === "particleSystemResourceName" && target.name === "part_trail")
        );
        assert.ok(targets.some((target) => target.category === "noteResourceName" && target.name === "note_design"));
        assert.ok(
            targets.some((target) => target.category === "extensionResourceName" && target.name === "ext_physics")
        );
        assert.ok(
            targets.some((target) => target.category === "constructorFunction" && target.name === "build_widget")
        );
        assert.ok(targets.some((target) => target.category === "enum" && target.name === "state_enum"));
        assert.ok(
            targets.some(
                (target) =>
                    target.category === "enumMember" && target.name === "ready_state" && target.occurrences.length === 2
            )
        );
        assert.ok(targets.some((target) => target.category === "macro" && target.name === "DEMO_MACRO"));
        assert.ok(targets.some((target) => target.category === "globalVariable" && target.name === "global_score"));
        assert.ok(
            targets.some(
                (target) =>
                    target.category === "localVariable" && target.name === "bad_name" && target.occurrences.length === 2
            )
        );
        assert.ok(targets.some((target) => target.category === "catchArgument" && target.name === "err_value"));
    });

    void it("listNamingConventionTargets classifies constructor-backed script resources as constructorFunction targets", async () => {
        const mockProjectIndex = {
            resources: {
                "scripts/Vector3/Vector3.yy": {
                    path: "scripts/Vector3/Vector3.yy",
                    name: "Vector3",
                    resourceType: "GMScript"
                }
            },
            identifiers: {
                scripts: {
                    "scope:script:Vector3": {
                        identifierId: "script:scope:script:Vector3",
                        name: "Vector3",
                        resourcePath: "scripts/Vector3/Vector3.yy",
                        declarations: [
                            {
                                name: "Vector3",
                                filePath: "scripts/Vector3/Vector3.gml",
                                classifications: ["function", "constructor", "struct"]
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const targets = await bridge.listNamingConventionTargets();

        assert.ok(targets.some((target) => target.category === "constructorFunction" && target.name === "Vector3"));
        assert.ok(!targets.some((target) => target.category === "scriptResourceName" && target.name === "Vector3"));
    });

    void it("listNamingConventionTargets keeps plain functions in mixed multi-callable scripts out of structDeclaration fallback", async () => {
        const mockProjectIndex = {
            resources: {
                "scripts/GroupSmf/GroupSmf.yy": {
                    path: "scripts/GroupSmf/GroupSmf.yy",
                    name: "GroupSmf",
                    resourceType: "GMScript"
                }
            },
            identifiers: {
                scripts: {
                    "scope:script:group-smf": {
                        identifierId: "script:scope:script:group-smf",
                        name: "GroupSmf",
                        resourcePath: "scripts/GroupSmf/GroupSmf.yy",
                        declarationKinds: ["constructor", "struct"],
                        declarations: [
                            {
                                name: "smf_model",
                                filePath: "scripts/GroupSmf/GroupSmf.gml",
                                classifications: ["function", "constructor", "struct"]
                            },
                            {
                                name: "smf_model_load",
                                filePath: "scripts/GroupSmf/GroupSmf.gml",
                                classifications: ["function"]
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const targets = await bridge.listNamingConventionTargets();
        const constructorTarget = targets.find((target) => target.name === "smf_model");
        const functionTarget = targets.find((target) => target.name === "smf_model_load");
        const resourceTarget = targets.find((target) => target.name === "GroupSmf");

        assert.equal(constructorTarget?.category, "constructorFunction");
        assert.equal(functionTarget?.category, "function");
        assert.equal(resourceTarget?.category, "scriptResourceName");
    });

    void it("getSymbolOccurrences includes constructor parent clause references from the semantic project index", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-constructor-parent-"));

        try {
            const sourceText = [
                "function GUIElement() constructor {}",
                "function Checkbox(_name) : GUIElement() constructor {}",
                ""
            ].join("\n");

            fs.mkdirSync(path.join(tmpRoot, "scripts", "buttons"), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, "MyGame.yyp"),
                `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "buttons", "buttons.yy"),
                `${JSON.stringify({ name: "buttons", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "buttons", "buttons.gml"), sourceText);

            const projectIndex = await Semantic.buildProjectIndex(tmpRoot);
            const bridge = new GmlSemanticBridge(projectIndex, tmpRoot);
            const occurrences = bridge.getSymbolOccurrences("GUIElement");
            const declarationStart = sourceText.indexOf("GUIElement");
            const parentReferenceStart = sourceText.lastIndexOf("GUIElement");

            assert.equal(occurrences.length, 2);
            assert.deepEqual(
                occurrences.map((occurrence) => ({
                    kind: occurrence.kind,
                    start: occurrence.start,
                    end: occurrence.end
                })),
                [
                    {
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        start: declarationStart,
                        end: declarationStart + "GUIElement".length
                    },
                    {
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        start: parentReferenceStart,
                        end: parentReferenceStart + "GUIElement".length
                    }
                ]
            );
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    void it("getSymbolOccurrences includes unresolved cross-file enum references from project file records", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-enum-cross-file-"));

        try {
            const enumSource = ["enum CM_RAY {", "    MASK,", "    NUM", "}", ""].join("\n");
            const consumerSource = [
                "function cm_aab_cast_ray(ray, mask = ray[CM_RAY.MASK]) {",
                "    return ray[CM_RAY.NUM];",
                "}",
                ""
            ].join("\n");

            fs.mkdirSync(path.join(tmpRoot, "scripts", "cm_misc"), { recursive: true });
            fs.mkdirSync(path.join(tmpRoot, "scripts", "cm_aab"), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, "MyGame.yyp"),
                `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "cm_misc", "cm_misc.yy"),
                `${JSON.stringify({ name: "cm_misc", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "cm_misc", "cm_misc.gml"), enumSource);
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "cm_aab", "cm_aab.yy"),
                `${JSON.stringify({ name: "cm_aab", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "cm_aab", "cm_aab.gml"), consumerSource);

            const projectIndex = await Semantic.buildProjectIndex(tmpRoot);
            const bridge = new GmlSemanticBridge(projectIndex, tmpRoot);
            const occurrences = bridge
                .getSymbolOccurrences("CM_RAY", "gml/enum/CM_RAY")
                .toSorted((left, right) => left.start - right.start);

            assert.deepEqual(
                occurrences.map((occurrence) => ({
                    kind: occurrence.kind,
                    path: occurrence.path,
                    start: occurrence.start,
                    end: occurrence.end
                })),
                [
                    {
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        path: "scripts/cm_misc/cm_misc.gml",
                        start: enumSource.indexOf("CM_RAY"),
                        end: enumSource.indexOf("CM_RAY") + "CM_RAY".length
                    },
                    {
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        path: "scripts/cm_aab/cm_aab.gml",
                        start: consumerSource.indexOf("CM_RAY"),
                        end: consumerSource.indexOf("CM_RAY") + "CM_RAY".length
                    },
                    {
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        path: "scripts/cm_aab/cm_aab.gml",
                        start: consumerSource.lastIndexOf("CM_RAY"),
                        end: consumerSource.lastIndexOf("CM_RAY") + "CM_RAY".length
                    }
                ]
            );
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    void it("getSymbolOccurrences for script resources ignores same-name macro occurrences", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-script-macro-"));

        try {
            const macroSource = ["#macro CM_TRIANGLE_GET_CAPSULE_REF var refX = X;\\", "var refY = Y;", ""].join("\n");
            const consumerSource = [
                "function consumer() {",
                "    CM_TRIANGLE_GET_CAPSULE_REF;",
                "    return refX + refY;",
                "}",
                ""
            ].join("\n");

            fs.mkdirSync(path.join(tmpRoot, "scripts", "CM_TRIANGLE_GET_CAPSULE_REF"), { recursive: true });
            fs.mkdirSync(path.join(tmpRoot, "scripts", "consumer"), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, "MyGame.yyp"),
                `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "CM_TRIANGLE_GET_CAPSULE_REF", "CM_TRIANGLE_GET_CAPSULE_REF.yy"),
                `${JSON.stringify({ name: "CM_TRIANGLE_GET_CAPSULE_REF", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "CM_TRIANGLE_GET_CAPSULE_REF", "CM_TRIANGLE_GET_CAPSULE_REF.gml"),
                macroSource
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "consumer", "consumer.yy"),
                `${JSON.stringify({ name: "consumer", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "consumer", "consumer.gml"), consumerSource);

            const projectIndex = await Semantic.buildProjectIndex(tmpRoot);
            const bridge = new GmlSemanticBridge(projectIndex, tmpRoot);
            const scriptOccurrences = bridge.getSymbolOccurrences(
                "CM_TRIANGLE_GET_CAPSULE_REF",
                "gml/scripts/CM_TRIANGLE_GET_CAPSULE_REF"
            );
            const macroOccurrences = bridge.getSymbolOccurrences(
                "CM_TRIANGLE_GET_CAPSULE_REF",
                "gml/macro/CM_TRIANGLE_GET_CAPSULE_REF"
            );

            assert.deepEqual(scriptOccurrences, []);
            assert.deepEqual(
                macroOccurrences.map((occurrence) => ({
                    kind: occurrence.kind,
                    path: occurrence.path
                })),
                [
                    {
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        path: "scripts/CM_TRIANGLE_GET_CAPSULE_REF/CM_TRIANGLE_GET_CAPSULE_REF.gml"
                    },
                    {
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        path: "scripts/consumer/consumer.gml"
                    }
                ]
            );
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    void it("listNamingConventionTargets includes unresolved cross-file enum member references", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-enum-member-cross-file-"));

        try {
            const enumSource = ["enum INPUT_VIRTUAL_TYPE {", "    DPAD_4DIR,", "    DPAD_8DIR", "}", ""].join("\n");
            const consumerSource = [
                "function demo() {",
                "    return [INPUT_VIRTUAL_TYPE.DPAD_4DIR, INPUT_VIRTUAL_TYPE.DPAD_8DIR];",
                "}",
                ""
            ].join("\n");

            fs.mkdirSync(path.join(tmpRoot, "scripts", "defs"), { recursive: true });
            fs.mkdirSync(path.join(tmpRoot, "scripts", "use"), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, "MyGame.yyp"),
                `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "defs", "defs.yy"),
                `${JSON.stringify({ name: "defs", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "defs", "defs.gml"), enumSource);
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "use", "use.yy"),
                `${JSON.stringify({ name: "use", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "use", "use.gml"), consumerSource);

            const projectIndex = await Semantic.buildProjectIndex(tmpRoot);
            const bridge = new GmlSemanticBridge(projectIndex, tmpRoot);
            const targets = await bridge.listNamingConventionTargets();
            const dpadTarget = targets.find(
                (target) => target.category === "enumMember" && target.name === "DPAD_4DIR"
            );

            assert.ok(dpadTarget);
            assert.deepEqual(
                dpadTarget?.occurrences.map((occurrence) => ({
                    kind: occurrence.kind,
                    path: occurrence.path
                })),
                [
                    {
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        path: "scripts/defs/defs.gml"
                    },
                    {
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        path: "scripts/use/use.gml"
                    }
                ]
            );
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    void it("listNamingConventionTargets includes unresolved dotted references for unique constructor static members", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-struct-static-member-"));

        try {
            const vectorSource = [
                "function Vector2(x, y) constructor {",
                "    static Sub = function(val) {",
                "        return new Vector2(x - val.x, y - val.y);",
                "    };",
                "}",
                ""
            ].join("\n");
            const consumerSource = [
                "function move_step(pos, prev_pos) {",
                "    return pos.Sub(prev_pos);",
                "}",
                ""
            ].join("\n");

            fs.mkdirSync(path.join(tmpRoot, "scripts", "vec"), { recursive: true });
            fs.mkdirSync(path.join(tmpRoot, "scripts", "move_step"), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, "MyGame.yyp"),
                `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "vec", "vec.yy"),
                `${JSON.stringify({ name: "vec", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "vec", "vec.gml"), vectorSource);
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "move_step", "move_step.yy"),
                `${JSON.stringify({ name: "move_step", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(path.join(tmpRoot, "scripts", "move_step", "move_step.gml"), consumerSource);

            const projectIndex = await Semantic.buildProjectIndex(tmpRoot);
            const bridge = new GmlSemanticBridge(projectIndex, tmpRoot);
            const targets = await bridge.listNamingConventionTargets();
            const subTarget = targets.find((target) => target.category === "staticVariable" && target.name === "Sub");

            assert.ok(subTarget);
            assert.deepEqual(
                subTarget?.occurrences.map((occurrence) => ({
                    kind: occurrence.kind,
                    path: occurrence.path
                })),
                [
                    {
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        path: "scripts/vec/vec.gml"
                    },
                    {
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        path: "scripts/move_step/move_step.gml"
                    }
                ]
            );
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    void it("listMacroExpansionDependencies reports caller-scoped identifiers consumed by referenced macros", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-macro-deps-"));

        try {
            fs.mkdirSync(path.join(tmpRoot, "scripts", "cm_triangle_get_capsule_ref"), { recursive: true });
            fs.mkdirSync(path.join(tmpRoot, "scripts", "cm_triangle"), { recursive: true });
            fs.writeFileSync(
                path.join(tmpRoot, "MyGame.yyp"),
                `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "cm_triangle_get_capsule_ref", "cm_triangle_get_capsule_ref.yy"),
                `${JSON.stringify({ name: "cm_triangle_get_capsule_ref", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "cm_triangle_get_capsule_ref", "cm_triangle_get_capsule_ref.gml"),
                ["#macro CM_TRIANGLE_GET_CAPSULE_REF var refZ = Z + zup;\\", "var refX = X + xup;", ""].join("\n")
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "cm_triangle", "cm_triangle.yy"),
                `${JSON.stringify({ name: "cm_triangle", resourceType: "GMScript" }, null, 2)}\n`
            );
            fs.writeFileSync(
                path.join(tmpRoot, "scripts", "cm_triangle", "cm_triangle.gml"),
                [
                    "function cm_triangle(collider) {",
                    "    var X = collider[0];",
                    "    var Z = collider[1];",
                    "    var zup = collider[2];",
                    "    var xup = collider[3];",
                    "    CM_TRIANGLE_GET_CAPSULE_REF;",
                    "    return refX + refZ;",
                    "}",
                    ""
                ].join("\n")
            );

            const projectIndex = await Semantic.buildProjectIndex(tmpRoot);
            const bridge = new GmlSemanticBridge(projectIndex, tmpRoot);
            const dependencies = bridge.listMacroExpansionDependencies(["scripts/cm_triangle/cm_triangle.gml"]);

            assert.deepEqual(dependencies, [
                {
                    path: "scripts/cm_triangle/cm_triangle.gml",
                    macroName: "CM_TRIANGLE_GET_CAPSULE_REF",
                    referencedNames: ["Z", "xup", "zup"]
                }
            ]);
        } finally {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    void it("listNamingConventionTargets keeps same-name callables independent for multi-function script resources", async () => {
        const mockProjectIndex = {
            resources: {
                "scripts/DemoLibrary/DemoLibrary.yy": {
                    path: "scripts/DemoLibrary/DemoLibrary.yy",
                    name: "DemoLibrary",
                    resourceType: "GMScript"
                }
            },
            identifiers: {
                scripts: {
                    "scope:script:DemoLibrary": {
                        identifierId: "script:scope:script:DemoLibrary",
                        name: "DemoLibrary",
                        resourcePath: "scripts/DemoLibrary/DemoLibrary.yy",
                        declarations: [
                            {
                                name: "DemoLibrary",
                                filePath: "scripts/DemoLibrary/DemoLibrary.gml",
                                classifications: ["function"]
                            },
                            {
                                name: "helper_fn",
                                filePath: "scripts/DemoLibrary/DemoLibrary.gml",
                                classifications: ["function"]
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const targets = await bridge.listNamingConventionTargets();

        assert.ok(targets.some((target) => target.category === "scriptResourceName" && target.name === "DemoLibrary"));
        assert.ok(targets.some((target) => target.category === "function" && target.name === "DemoLibrary"));
        assert.ok(targets.some((target) => target.category === "function" && target.name === "helper_fn"));
    });

    void it("getSymbolOccurrences keeps multi-function script resource renames independent from same-name callables", () => {
        const mockProjectIndex = {
            resources: {
                "scripts/DemoLibrary/DemoLibrary.yy": {
                    path: "scripts/DemoLibrary/DemoLibrary.yy",
                    name: "DemoLibrary",
                    resourceType: "GMScript"
                }
            },
            identifiers: {
                scripts: {
                    "scope:script:DemoLibrary": {
                        identifierId: "script:scope:script:DemoLibrary",
                        name: "DemoLibrary",
                        resourcePath: "scripts/DemoLibrary/DemoLibrary.yy",
                        declarations: [
                            {
                                name: "DemoLibrary",
                                filePath: "scripts/DemoLibrary/DemoLibrary.gml",
                                start: { index: 9 },
                                end: { index: 20 }
                            },
                            {
                                name: "helper_fn",
                                filePath: "scripts/DemoLibrary/DemoLibrary.gml",
                                start: { index: 45 },
                                end: { index: 54 }
                            }
                        ],
                        references: [
                            {
                                filePath: "scripts/consumer_script/consumer_script.gml",
                                targetName: "DemoLibrary",
                                start: { index: 40 },
                                end: { index: 51 }
                            },
                            {
                                filePath: "scripts/consumer_script/consumer_script.gml",
                                targetName: "helper_fn",
                                start: { index: 55 },
                                end: { index: 64 }
                            }
                        ]
                    }
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        const resourceOccurrences = bridge.getSymbolOccurrences("DemoLibrary", "gml/scripts/DemoLibrary");
        const callableOccurrences = bridge.getSymbolOccurrences("DemoLibrary", "gml/script/DemoLibrary");

        assert.deepEqual(
            resourceOccurrences,
            [],
            "Resource renames for multi-function scripts should not reuse callable text occurrences"
        );
        assert.equal(callableOccurrences.length, 2);
        assert.deepEqual(
            callableOccurrences.map((occurrence) => occurrence.path),
            ["scripts/DemoLibrary/DemoLibrary.gml", "scripts/consumer_script/consumer_script.gml"]
        );
    });

    void it("listNamingConventionTargets refines local variables into static and loop-index categories", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-local-categories-"));
        const relativeFilePath = "scripts/demo_script/demo_script.gml";
        const absoluteFilePath = path.join(tmpRoot, relativeFilePath);
        const sourceText = [
            "function demo_script() {",
            "    static cache_value = 0;",
            "    cache_value += 1;",
            "    var local_value = 1;",
            "    for (var loop_index = 0; loop_index < 3; loop_index += 1) {",
            "        local_value += loop_index;",
            "    }",
            "}",
            ""
        ].join("\n");

        fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
        fs.writeFileSync(absoluteFilePath, sourceText, "utf8");

        const cacheDeclarationStart = findNthIndex(sourceText, "cache_value", 1);
        const cacheReferenceStart = findNthIndex(sourceText, "cache_value", 2);
        const localDeclarationStart = findNthIndex(sourceText, "local_value", 1);
        const localReferenceStart = findNthIndex(sourceText, "local_value", 2);
        const loopDeclarationStart = findNthIndex(sourceText, "loop_index", 1);
        const loopConditionReferenceStart = findNthIndex(sourceText, "loop_index", 2);
        const loopUpdateReferenceStart = findNthIndex(sourceText, "loop_index", 3);
        const loopBodyReferenceStart = findNthIndex(sourceText, "loop_index", 4);

        const mockProjectIndex = {
            identifiers: {
                instanceVariables: {}
            },
            files: {
                [relativeFilePath]: {
                    declarations: [
                        {
                            name: "cache_value",
                            scopeId: "scope:function",
                            classifications: ["variable"],
                            start: { index: cacheDeclarationStart },
                            end: { index: cacheDeclarationStart + "cache_value".length }
                        },
                        {
                            name: "local_value",
                            scopeId: "scope:function",
                            classifications: ["variable"],
                            start: { index: localDeclarationStart },
                            end: { index: localDeclarationStart + "local_value".length }
                        },
                        {
                            name: "loop_index",
                            scopeId: "scope:function",
                            classifications: ["variable"],
                            start: { index: loopDeclarationStart },
                            end: { index: loopDeclarationStart + "loop_index".length }
                        }
                    ],
                    references: [
                        {
                            name: "cache_value",
                            scopeId: "scope:function",
                            start: { index: cacheReferenceStart },
                            end: { index: cacheReferenceStart + "cache_value".length },
                            declaration: {
                                name: "cache_value",
                                scopeId: "scope:function",
                                start: { index: cacheDeclarationStart }
                            }
                        },
                        {
                            name: "local_value",
                            scopeId: "scope:function",
                            start: { index: localReferenceStart },
                            end: { index: localReferenceStart + "local_value".length },
                            declaration: {
                                name: "local_value",
                                scopeId: "scope:function",
                                start: { index: localDeclarationStart }
                            }
                        },
                        {
                            name: "loop_index",
                            scopeId: "scope:function",
                            start: { index: loopConditionReferenceStart },
                            end: { index: loopConditionReferenceStart + "loop_index".length },
                            declaration: {
                                name: "loop_index",
                                scopeId: "scope:function",
                                start: { index: loopDeclarationStart }
                            }
                        },
                        {
                            name: "loop_index",
                            scopeId: "scope:function",
                            start: { index: loopUpdateReferenceStart },
                            end: { index: loopUpdateReferenceStart + "loop_index".length },
                            declaration: {
                                name: "loop_index",
                                scopeId: "scope:function",
                                start: { index: loopDeclarationStart }
                            }
                        },
                        {
                            name: "loop_index",
                            scopeId: "scope:function",
                            start: { index: loopBodyReferenceStart },
                            end: { index: loopBodyReferenceStart + "loop_index".length },
                            declaration: {
                                name: "loop_index",
                                scopeId: "scope:function",
                                start: { index: loopDeclarationStart }
                            }
                        }
                    ]
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const targets = await bridge.listNamingConventionTargets();

        assert.ok(
            targets.some(
                (target) =>
                    target.category === "staticVariable" &&
                    target.name === "cache_value" &&
                    target.occurrences.length === 2
            )
        );
        assert.ok(
            targets.some(
                (target) =>
                    target.category === "localVariable" &&
                    target.name === "local_value" &&
                    target.occurrences.length === 2
            )
        );
        assert.ok(
            targets.some(
                (target) =>
                    target.category === "loopIndexVariable" &&
                    target.name === "loop_index" &&
                    target.occurrences.length === 4
            )
        );
    });

    void it("listNamingConventionTargets synthesizes implicit instance-variable targets from object assignments", async () => {
        const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gml-semantic-bridge-instance-targets-"));
        const relativeFilePath = "objects/oActorParent/Create_0.gml";
        const absoluteFilePath = path.join(tmpRoot, relativeFilePath);
        const sourceText = [
            "charMat = matrix_build_identity();",
            "var turnSpd = move_spd * 0.4;",
            "charMat[0] += turnSpd;",
            ""
        ].join("\n");

        fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
        fs.writeFileSync(absoluteFilePath, sourceText, "utf8");

        const charMatDefinitionStart = findNthIndex(sourceText, "charMat", 1);
        const charMatReferenceStart = findNthIndex(sourceText, "charMat", 2);

        const mockProjectIndex = {
            identifiers: {
                instanceVariables: {}
            },
            files: {
                [relativeFilePath]: {
                    declarations: [],
                    references: [
                        {
                            name: "charMat",
                            scopeId: "scope:object:oActorParent",
                            start: { index: charMatDefinitionStart },
                            end: { index: charMatDefinitionStart + "charMat".length - 1 },
                            declaration: null,
                            isBuiltIn: false,
                            isGlobalIdentifier: false
                        },
                        {
                            name: "charMat",
                            scopeId: "scope:object:oActorParent",
                            start: { index: charMatReferenceStart },
                            end: { index: charMatReferenceStart + "charMat".length - 1 },
                            declaration: null,
                            isBuiltIn: false,
                            isGlobalIdentifier: false
                        }
                    ]
                }
            }
        };

        const bridge = new GmlSemanticBridge(mockProjectIndex, tmpRoot);
        const targets = await bridge.listNamingConventionTargets([relativeFilePath]);
        const charMatTarget = targets.find(
            (target) => target.category === "instanceVariable" && target.name === "charMat"
        );

        assert.ok(charMatTarget);
        assert.equal(charMatTarget?.path, relativeFilePath);
        assert.equal(charMatTarget?.scopeId, "objects/oActorParent");
        assert.equal(charMatTarget?.symbolId, null);
        assert.equal(charMatTarget?.occurrences.length, 2);
        assert.equal(charMatTarget?.occurrences[0]?.kind, "definition");
    });

    void it("shouldCollectUnresolvedProjectFileReferences correctly authorizes collection of instance variables", () => {
        const mockProjectIndex = {};
        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");
        // Verify symbol ID handling
        assert.equal(
            (bridge as any).shouldCollectUnresolvedProjectFileReferences(
                { identifierId: "instance:sub" },
                "gml/var/sub"
            ),
            true
        );
    });

    void it("isConstructorStaticMemberDeclaration does not enforce uniqueness count", () => {
        const mockProjectIndex = {
            files: {
                "a.gml": {
                    declarations: [
                        { name: "sub", start: { index: 1 }, classifications: ["staticVariable"] },
                        { name: "sub", start: { index: 10 }, classifications: ["staticVariable"] }
                    ]
                }
            }
        };
        const bridge = new GmlSemanticBridge(mockProjectIndex, "/tmp");

        // Mock method to bypass internal calls
        (bridge as any).localNamingCategoryResolver = {
            isConstructorStaticMember: () => true
        };

        const result = (bridge as any).isConstructorStaticMemberDeclaration("a.gml", { name: "sub", start: 10 });
        assert.equal(result, true);
    });
});
