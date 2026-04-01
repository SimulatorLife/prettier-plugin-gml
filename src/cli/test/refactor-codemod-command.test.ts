import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Parser } from "@gmloop/parser";

import { runCliTestCommand } from "../src/cli.js";

/**
 * Write a UTF-8 file inside a temporary synthetic GameMaker project.
 */
async function writeProjectFile(projectRoot: string, relativePath: string, contents: string): Promise<void> {
    const absolutePath = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
}

/**
 * Create a script resource with its metadata and source file.
 */
async function writeScriptResource(projectRoot: string, scriptName: string, sourceText: string): Promise<void> {
    await writeProjectFile(
        projectRoot,
        `scripts/${scriptName}/${scriptName}.yy`,
        `${JSON.stringify(
            {
                resourceType: "GMScript",
                name: scriptName
            },
            null,
            4
        )}\n`
    );
    await writeProjectFile(projectRoot, `scripts/${scriptName}/${scriptName}.gml`, sourceText);
}

/**
 * Create an object resource with event source files.
 */
async function writeObjectResource(
    projectRoot: string,
    objectName: string,
    eventFiles: Record<string, string>
): Promise<void> {
    await writeProjectFile(
        projectRoot,
        `objects/${objectName}/${objectName}.yy`,
        `${JSON.stringify(
            {
                resourceType: "GMObject",
                name: objectName
            },
            null,
            4
        )}\n`
    );

    for (const [relativeEventFilePath, sourceText] of Object.entries(eventFiles)) {
        await writeProjectFile(projectRoot, `objects/${objectName}/${relativeEventFilePath}`, sourceText);
    }
}

/**
 * Create a temporary GameMaker project root for CLI codemod tests.
 */
async function createSyntheticProject(config: Record<string, unknown>): Promise<string> {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-refactor-cli-"));
    await writeProjectFile(
        projectRoot,
        "MyGame.yyp",
        `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 4)}\n`
    );
    await writeProjectFile(projectRoot, "gmloop.json", `${JSON.stringify(config, null, 4)}\n`);
    return projectRoot;
}

/**
 * Recursively collect all `.gml` files in a synthetic project.
 */
async function listProjectGmlFiles(projectRoot: string, directory = projectRoot): Promise<Array<string>> {
    const entries = await readdir(directory, { withFileTypes: true });
    const gmlFiles: Array<string> = [];

    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            gmlFiles.push(...(await listProjectGmlFiles(projectRoot, absolutePath)));
            continue;
        }

        if (entry.isFile() && absolutePath.endsWith(".gml")) {
            gmlFiles.push(path.relative(projectRoot, absolutePath));
        }
    }

    return gmlFiles.toSorted();
}

/**
 * Parse every `.gml` file in the synthetic project to verify the refactor output
 * remains valid GameMaker code.
 */
async function assertProjectGmlFilesParse(projectRoot: string): Promise<void> {
    const gmlFiles = await listProjectGmlFiles(projectRoot);
    assert.ok(gmlFiles.length > 0, "expected the synthetic project to contain GML files");

    for (const relativePath of gmlFiles) {
        const sourceText = await readFile(path.join(projectRoot, relativePath), "utf8");
        assert.doesNotThrow(() => {
            const ast = Parser.GMLParser.parse(sourceText);
            assert.equal(ast.type, "Program");
        }, `expected ${relativePath} to remain parseable after refactor codemods`);
    }
}

void test("refactor codemod --list discovers gmloop.json and tolerates unrelated top-level config", async () => {
    const projectRoot = await createSyntheticProject({
        printWidth: 95,
        lintRules: {
            "gml/no-globalvar": "error"
        },
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--list"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Project root:/);
        assert.match(result.stdout, /Config path:/);
        assert.match(result.stdout, /loopLengthHoisting: configured, selected/);
        assert.match(result.stdout, /Effective config: \{\}/);
        assert.match(result.stdout, /namingConvention: not configured, selected/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --only filters configured codemods during listing", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    localVariable: {
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                loopLengthHoisting: {},
                namingConvention: {}
            }
        }
    });

    try {
        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--list", "--only", "loopLengthHoisting"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /loopLengthHoisting: configured, selected/);
        assert.match(result.stdout, /namingConvention: configured, filtered out/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write applies configured namingConvention renames across project resources", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    scriptResourceName: {
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(projectRoot, "demo_script", "function demo_script() {\n    return 1;\n}\n");
        await writeScriptResource(
            projectRoot,
            "consumer_script",
            "function consumer_script() {\n    return demo_script();\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "scripts/demo_script", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        await access(path.join(projectRoot, "scripts/demoScript/demoScript.gml"));
        const renamedSource = await readFile(path.join(projectRoot, "scripts/demoScript/demoScript.gml"), "utf8");
        const consumerSource = await readFile(
            path.join(projectRoot, "scripts/consumer_script/consumer_script.gml"),
            "utf8"
        );
        const renamedMetadata = await readFile(path.join(projectRoot, "scripts/demoScript/demoScript.yy"), "utf8");

        assert.match(renamedSource, /function demoScript\(\)/);
        assert.match(consumerSource, /demoScript\(\)/);
        assert.match(renamedMetadata, /"name"\s*:\s*"demoScript"/);
        await assert.rejects(access(path.join(projectRoot, "scripts/demo_script/demo_script.gml")));
        assert.match(result.stdout, /\[namingConvention\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write preserves allowed leading underscores while applying safe snake-case renames", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    resource: {
                        caseStyle: "lower_snake"
                    },
                    variable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "__InputError",
            "function __InputError() {\n    var _TargetShader = 1;\n    return _TargetShader;\n}\n"
        );
        await writeScriptResource(
            projectRoot,
            "consumer_script",
            "function consumer_script() {\n    return __InputError();\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        await access(path.join(projectRoot, "scripts/__input_error/__input_error.gml"));
        const renamedSource = await readFile(path.join(projectRoot, "scripts/__input_error/__input_error.gml"), "utf8");
        const renamedMetadata = await readFile(
            path.join(projectRoot, "scripts/__input_error/__input_error.yy"),
            "utf8"
        );
        const consumerSource = await readFile(
            path.join(projectRoot, "scripts/consumer_script/consumer_script.gml"),
            "utf8"
        );

        assert.match(renamedSource, /function __input_error\(\)/);
        assert.match(renamedSource, /var _target_shader = 1;/);
        assert.match(renamedSource, /return _target_shader;/);
        assert.match(renamedMetadata, /"name"\s*:\s*"__input_error"/);
        assert.match(consumerSource, /return __input_error\(\);/);

        const typeIndex = renamedMetadata.indexOf('"resourceType"');
        const pathIndex = renamedMetadata.indexOf('"resourcePath"');
        assert.ok(typeIndex !== -1 && pathIndex !== -1 && typeIndex < pathIndex);
        await assert.rejects(access(path.join(projectRoot, "scripts/input_error/input_error.gml")));
        await assert.rejects(access(path.join(projectRoot, "scripts/__InputError/__InputError.gml")));
        assert.match(result.stdout, /\[namingConvention\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write normalizes existing script metadata resourceType/resourcePath order", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    resource: {
                        caseStyle: "lower_snake"
                    },
                    variable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        const scriptDir = path.join(projectRoot, "scripts", "__InputError");
        await mkdir(scriptDir, { recursive: true });

        await writeProjectFile(
            projectRoot,
            "scripts/__InputError/__InputError.yy",
            `{
  "resourcePath":"scripts/__InputError/__InputError.yy",
  "resourceType":"GMScript",
  "name":"__InputError"
}`
        );
        await writeProjectFile(
            projectRoot,
            "scripts/__InputError/__InputError.gml",
            "function __InputError() { return 1; }\n"
        );

        const result = await runCliTestCommand({ argv: ["refactor", "codemod", "--write"], cwd: projectRoot });
        assert.equal(result.exitCode, 0);

        const metadata = await readFile(path.join(projectRoot, "scripts", "__input_error", "__input_error.yy"), "utf8");
        const typeIndex = metadata.indexOf('"resourceType"');
        const pathIndex = metadata.indexOf('"resourcePath"');

        assert.ok(typeIndex !== -1, "resourceType should exist after rename");
        assert.ok(pathIndex !== -1, "resourcePath should exist after rename");
        assert.ok(typeIndex < pathIndex, "resourceType must come before resourcePath to be valid for GameMaker");
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write does not add resourcePath to scripts that did not have one", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    resource: {
                        caseStyle: "lower_snake"
                    },
                    variable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeProjectFile(
            projectRoot,
            "scripts/__InputError/__InputError.yy",
            `{
  "resourceType":"GMScript",
  "name":"__InputError"
}`
        );
        await writeProjectFile(
            projectRoot,
            "scripts/__InputError/__InputError.gml",
            "function __InputError() { return 1; }\n"
        );

        const result = await runCliTestCommand({ argv: ["refactor", "codemod", "--write"], cwd: projectRoot });
        assert.equal(result.exitCode, 0);

        const metadata = await readFile(path.join(projectRoot, "scripts", "__input_error", "__input_error.yy"), "utf8");
        assert.match(metadata, /"name"\s*:\s*"__input_error"/);
        assert.match(metadata, /"resourceType"\s*:\s*"GMScript"/);
        assert.doesNotMatch(metadata, /"resourcePath"\s*:/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write renames implicit instance variables across object event files", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    variable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeObjectResource(projectRoot, "oActorParent", {
            "Create_0.gml": "charMat = matrix_build_identity();\n",
            "Step_0.gml": "var turnSpd = move_spd * 0.4;\ncharMat[0] += turnSpd;\n"
        });

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const createSource = await readFile(path.join(projectRoot, "objects/oActorParent/Create_0.gml"), "utf8");
        const stepSource = await readFile(path.join(projectRoot, "objects/oActorParent/Step_0.gml"), "utf8");

        assert.match(createSource, /char_mat = matrix_build_identity\(\);/);
        assert.match(stepSource, /var turn_spd = move_spd \* 0\.4;/);
        assert.match(stepSource, /char_mat\[0\] \+= turn_spd;/);
        assert.doesNotMatch(stepSource, /\bcharMat\b/);
        assert.match(result.stdout, /\[namingConvention\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write preserves valid enum member accesses when locals share the same name", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    enum: {
                        prefix: "e",
                        caseStyle: "camel"
                    },
                    variable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "cm_misc",
            [
                "enum CM {",
                "    TYPE,",
                "    X,",
                "    Y,",
                "    Z,",
                "    SLOPEANGLE,",
                "    NUM",
                "}",
                "",
                "function cm_collider(X, Y, Z, slopeAngle = 40) {",
                "    var collider = array_create(CM.NUM);",
                "    collider[@ CM.X] = X;",
                "    collider[@ CM.Y] = Y;",
                "    collider[@ CM.Z] = Z;",
                "    collider[@ CM.SLOPEANGLE] = slopeAngle;",
                "    return collider;",
                "}",
                ""
            ].join("\n")
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const updatedSource = await readFile(path.join(projectRoot, "scripts/cm_misc/cm_misc.gml"), "utf8");

        assert.match(updatedSource, /enum ecm \{/);
        assert.match(updatedSource, /function cm_collider\(x, y, z, slope_angle = 40\)/);
        assert.match(updatedSource, /collider\[@ ecm\.X\] = x;/);
        assert.match(updatedSource, /collider\[@ ecm\.Y\] = y;/);
        assert.match(updatedSource, /collider\[@ ecm\.Z\] = z;/);
        assert.match(updatedSource, /collider\[@ ecm\.SLOPEANGLE\] = slope_angle;/);
        assert.doesNotMatch(updatedSource, /\becmM\b/);
        assert.doesNotMatch(updatedSource, /\.xX\b/);
        assert.doesNotMatch(updatedSource, /\.yY\b/);
        assert.doesNotMatch(updatedSource, /\.zZ\b/);
        assert.doesNotMatch(updatedSource, /\bslope_anglee\b/);
        assert.doesNotThrow(() => {
            const ast = Parser.GMLParser.parse(updatedSource);
            assert.equal(ast.type, "Program");
        });
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write renames cross-file enum references and reparses the rewritten project", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    enum: {
                        prefix: "e",
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "cm_misc",
            ["enum CM_RAY {", "    MASK,", "    NUM", "}", ""].join("\n")
        );
        await writeScriptResource(
            projectRoot,
            "cm_aab",
            ["function cm_aab_cast_ray(ray, mask = ray[CM_RAY.MASK]) {", "    return ray[CM_RAY.NUM];", "}", ""].join(
                "\n"
            )
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const enumSource = await readFile(path.join(projectRoot, "scripts/cm_misc/cm_misc.gml"), "utf8");
        const consumerSource = await readFile(path.join(projectRoot, "scripts/cm_aab/cm_aab.gml"), "utf8");

        assert.match(enumSource, /enum ecmRay \{/);
        assert.match(consumerSource, /mask = ray\[ecmRay\.MASK\]/);
        assert.match(consumerSource, /return ray\[ecmRay\.NUM\];/);
        assert.doesNotMatch(consumerSource, /\bCM_RAY\b/);

        await assertProjectGmlFilesParse(projectRoot);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write keeps reserved built-in local names intact and reparses the rewritten project", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    variable: {
                        caseStyle: "lower_snake"
                    },
                    spriteResourceName: {
                        prefix: "spr_",
                        caseStyle: "lower_snake"
                    }
                },
                exclusivePrefixes: {
                    spr_: "spriteResourceName"
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "cm_collider",
            [
                "function cm_collider_check(collider) {",
                "    var X = collider[CM.X];",
                "    var Y = collider[CM.Y];",
                "    var halfX = 1;",
                "    return X + Y + halfX;",
                "}",
                ""
            ].join("\n")
        );
        await writeScriptResource(
            projectRoot,
            "group_smf",
            [
                "function group_smf(path, texName) {",
                '    var spr_id = asset_get_index(filename_change_ext(filename_name(path), "_" + string(texName)));',
                "    return spr_id;",
                "}",
                ""
            ].join("\n")
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const colliderSource = await readFile(path.join(projectRoot, "scripts/cm_collider/cm_collider.gml"), "utf8");
        const groupSmfSource = await readFile(path.join(projectRoot, "scripts/group_smf/group_smf.gml"), "utf8");

        assert.match(colliderSource, /var X = collider\[CM\.X\];/);
        assert.match(colliderSource, /var Y = collider\[CM\.Y\];/);
        assert.match(colliderSource, /var half_x = 1;/);
        assert.match(colliderSource, /return X \+ Y \+ half_x;/);
        assert.match(groupSmfSource, /var spr_id = asset_get_index/);
        assert.match(groupSmfSource, /string\(tex_name\)/);
        assert.match(groupSmfSource, /return spr_id;/);
        assert.match(result.stdout, /reserved GameMaker identifier/);

        await assertProjectGmlFilesParse(projectRoot);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write skips local renames required by referenced macro expansions and reparses the rewritten project", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    variable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "cm_triangle_get_capsule_ref",
            ["#macro CM_TRIANGLE_GET_CAPSULE_REF var refZ = Z + zup;\\", "var refX = X + xup;", ""].join("\n")
        );
        await writeScriptResource(
            projectRoot,
            "cm_triangle",
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

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const triangleSource = await readFile(path.join(projectRoot, "scripts/cm_triangle/cm_triangle.gml"), "utf8");

        assert.match(triangleSource, /var X = collider\[0\];/);
        assert.match(triangleSource, /var Z = collider\[1\];/);
        assert.match(triangleSource, /CM_TRIANGLE_GET_CAPSULE_REF;/);
        assert.match(result.stdout, /macro expansion 'CM_TRIANGLE_GET_CAPSULE_REF' depends on 'Z'/);

        await assertProjectGmlFilesParse(projectRoot);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write skips argument renames that would collide with reachable locals and reparses the rewritten project", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    argument: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "collision_demo",
            [
                "function collision_demo(M) {",
                "    var m = array_create(16);",
                "    array_copy(m, 0, M, 0, 16);",
                "    return m[0] + M[0];",
                "}",
                "",
                "function cm_spatialhash_get_region(spatialhash, AABB) {",
                "    var aabb = CM_SPATIALHASH_AABB;",
                "    if (is_undefined(aabb)) {",
                "        return AABB[0];",
                "    }",
                "    return aabb[0] + AABB[0];",
                "}",
                "",
                "function stile_bake_center(vbuff, polygon, N) {",
                "    for (var n = array_length(polygon); n > 0; --n) {",
                "        show_debug_message(N.x + n);",
                "    }",
                "}",
                ""
            ].join("\n")
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const updatedSource = await readFile(
            path.join(projectRoot, "scripts/collision_demo/collision_demo.gml"),
            "utf8"
        );

        assert.match(updatedSource, /function collision_demo\(M\)/);
        assert.match(updatedSource, /array_copy\(m, 0, M, 0, 16\);/);
        assert.match(updatedSource, /function cm_spatialhash_get_region\(spatialhash, AABB\)/);
        assert.match(updatedSource, /return aabb\[0\] \+ AABB\[0\];/);
        assert.match(updatedSource, /function stile_bake_center\(vbuff, polygon, N\)/);
        assert.match(updatedSource, /show_debug_message\(N\.x \+ n\);/);
        assert.match(result.stdout, /already exists in the same scope/);

        await assertProjectGmlFilesParse(projectRoot);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write updates constructor inheritance references when renaming struct declarations", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    structDeclaration: {
                        caseStyle: "pascal"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "buttons",
            [
                "function GUIElement() constructor {}",
                "function Checkbox(_name, _x, _y, _checked) : GUIElement() constructor {}",
                ""
            ].join("\n")
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const buttonsSource = await readFile(path.join(projectRoot, "scripts/buttons/buttons.gml"), "utf8");

        assert.match(buttonsSource, /function GuiElement\(\) constructor \{\}/);
        assert.match(buttonsSource, /function Checkbox\(_name, _x, _y, _checked\) : GuiElement\(\) constructor \{\}/);

        await assertProjectGmlFilesParse(projectRoot);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write does not rename plain functions in mixed multi-callable scripts when only struct declarations are configured", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    structDeclaration: {
                        caseStyle: "pascal"
                    },
                    resource: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "GroupSmf",
            [
                "function smf_model() constructor {}",
                "",
                "function smf_model_load(path) {",
                "    return new smf_model();",
                "}",
                ""
            ].join("\n")
        );
        await writeScriptResource(
            projectRoot,
            "use_it",
            ["function use_it() {", '    global.model_player = smf_model_load("Mushroom.smf");', "}", ""].join("\n")
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        await access(path.join(projectRoot, "scripts/group_smf/group_smf.gml"));
        const groupSmfSource = await readFile(path.join(projectRoot, "scripts/group_smf/group_smf.gml"), "utf8");
        const consumerSource = await readFile(path.join(projectRoot, "scripts/use_it/use_it.gml"), "utf8");

        assert.match(groupSmfSource, /function SmfModel\(\) constructor \{\}/);
        assert.match(groupSmfSource, /return new SmfModel\(\);/);
        assert.match(groupSmfSource, /function smf_model_load\(path\)/);
        assert.doesNotMatch(groupSmfSource, /function SmfModelLoad\(path\)/);
        assert.match(consumerSource, /global\.model_player = smf_model_load\("Mushroom\.smf"\);/);
        assert.doesNotMatch(consumerSource, /\bSmfModelLoad\(/);

        await assertProjectGmlFilesParse(projectRoot);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write lets multi-function scripts rename the resource and same-name callable independently", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    scriptResourceName: {
                        caseStyle: "lower_snake"
                    },
                    function: {
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "DemoLibrary",
            [
                "function DemoLibrary() {",
                "    return helper_fn();",
                "}",
                "",
                "function helper_fn() {",
                "    return 1;",
                "}",
                ""
            ].join("\n")
        );
        await writeScriptResource(
            projectRoot,
            "consumer_script",
            "function consumer_script() {\n    return DemoLibrary() + helper_fn();\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        await access(path.join(projectRoot, "scripts/demo_library/demo_library.gml"));
        const renamedLibrarySource = await readFile(
            path.join(projectRoot, "scripts/demo_library/demo_library.gml"),
            "utf8"
        );
        const renamedMetadata = await readFile(path.join(projectRoot, "scripts/demo_library/demo_library.yy"), "utf8");
        const consumerSource = await readFile(
            path.join(projectRoot, "scripts/consumer_script/consumer_script.gml"),
            "utf8"
        );

        assert.match(renamedLibrarySource, /function demoLibrary\(\)/);
        assert.match(renamedLibrarySource, /return helperFn\(\);/);
        assert.match(renamedLibrarySource, /function helperFn\(\)/);
        assert.match(renamedMetadata, /"name"\s*:\s*"demo_library"/);
        assert.match(consumerSource, /return demoLibrary\(\) \+ helperFn\(\);/);
        await assert.rejects(access(path.join(projectRoot, "scripts/DemoLibrary/DemoLibrary.gml")));
        assert.match(result.stdout, /\[namingConvention\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write applies configured loop-length hoisting changes", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "demo_script",
            "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const updatedSource = await readFile(path.join(projectRoot, "scripts/demo_script/demo_script.gml"), "utf8");
        assert.match(updatedSource, /var len = array_length\(items\);/);
        assert.match(result.stdout, /\[loopLengthHoisting\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write only rebuilds the project index between changed codemods", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    localVariable: {
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                loopLengthHoisting: {},
                namingConvention: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "demo_script",
            [
                "function demo_script(items) {",
                "    var bad_name = 0;",
                "    for (var i = 0; i < array_length(items); i++) {",
                "        bad_name += items[i];",
                "    }",
                "    return bad_name;",
                "}",
                ""
            ].join("\n")
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write", "--verbose"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Rebuilding project index after codemod loopLengthHoisting/);
        assert.doesNotMatch(result.stdout, /Rebuilding project index after codemod namingConvention/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor infers codemod mode from project config when no rename target is specified", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "demo_script",
            "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "--project-root", projectRoot, "--write"]
        });

        assert.equal(result.exitCode, 0);
        const updatedSource = await readFile(path.join(projectRoot, "scripts/demo_script/demo_script.gml"), "utf8");
        assert.match(updatedSource, /var len = array_length\(items\);/);
        assert.match(result.stdout, /\[loopLengthHoisting\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod target paths restrict which gml files are rewritten", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "selected_script",
            "for (var i = 0; i < array_length(selected_items); i++) {\n    total += i;\n}\n"
        );
        await writeScriptResource(
            projectRoot,
            "other_script",
            "for (var i = 0; i < array_length(other_items); i++) {\n    total += i;\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "scripts/selected_script", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const selectedSource = await readFile(
            path.join(projectRoot, "scripts/selected_script/selected_script.gml"),
            "utf8"
        );
        const otherSource = await readFile(path.join(projectRoot, "scripts/other_script/other_script.gml"), "utf8");
        assert.match(selectedSource, /var len = array_length\(selected_items\);/);
        assert.doesNotMatch(otherSource, /var len = array_length\(other_items\);/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod errors when gmloop.json cannot be found", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-refactor-cli-missing-config-"));
    await writeProjectFile(
        projectRoot,
        "MyGame.yyp",
        `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 4)}\n`
    );

    try {
        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--list"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr, /Could not find gmloop config file/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});
