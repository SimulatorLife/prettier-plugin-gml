import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Refactor } from "../index.js";

/**
 * Write a temporary `gmloop.json` file and return its absolute path.
 */
async function writeConfigFile(config: Record<string, unknown>): Promise<string> {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-config-"));
    const configPath = path.join(tempRoot, "gmloop.json");
    await writeFile(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
    return configPath;
}

void test("loadGmloopProjectConfig accepts unrelated top-level keys and normalizes refactor config", async () => {
    const configPath = await writeConfigFile({
        printWidth: 95,
        lintRules: {
            "gml/no-globalvar": "error"
        },
        refactor: {
            namingConventionPolicy: {
                rules: {
                    localVariable: {
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                namingConvention: {},
                loopLengthHoisting: {
                    functionSuffixes: {
                        array_length: "len"
                    }
                }
            }
        }
    });

    try {
        const config = await Refactor.loadGmloopProjectConfig(configPath);

        assert.equal(config.printWidth, 95);
        assert.deepEqual(config.lintRules, {
            "gml/no-globalvar": "error"
        });
        assert.deepEqual(config.refactor?.namingConventionPolicy?.rules.localVariable, {
            caseStyle: "camel"
        });
        assert.deepEqual(config.refactor?.codemods?.loopLengthHoisting, {
            functionSuffixes: {
                array_length: "len"
            }
        });
        assert.deepEqual(config.refactor?.codemods?.namingConvention, {});
    } finally {
        await rm(path.dirname(configPath), { recursive: true, force: true });
    }
});

void test("loadGmloopProjectConfig supports gmloop.json files with only a refactor section", async () => {
    const configPath = await writeConfigFile({
        refactor: {
            codemods: {
                namingConvention: {}
            }
        }
    });

    try {
        const config = await Refactor.loadGmloopProjectConfig(configPath);
        assert.deepEqual(config.refactor, {
            codemods: {
                namingConvention: {}
            }
        });
    } finally {
        await rm(path.dirname(configPath), { recursive: true, force: true });
    }
});

void test("normalizeRefactorProjectConfig rejects malformed refactor sections", () => {
    assert.throws(
        () =>
            Refactor.normalizeRefactorProjectConfig({
                codemods: {
                    unknownCodemod: {}
                }
            }),
        {
            name: "TypeError",
            message: /Unknown refactor codemod/
        }
    );

    assert.throws(
        () =>
            Refactor.normalizeRefactorProjectConfig({
                namingConventionPolicy: {
                    rules: {
                        localVariable: {
                            caseStyle: "invalid"
                        }
                    }
                }
            }),
        {
            name: "TypeError",
            message: /caseStyle must be one of/
        }
    );
});
