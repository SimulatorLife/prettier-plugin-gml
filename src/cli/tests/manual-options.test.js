import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    buildManualRepositoryEndpoints,
    normalizeManualRepository,
    resolveManualRepoValue,
    MANUAL_CACHE_ROOT_ENV_VAR,
    resolveManualCacheRoot,
    createManualVerboseState
} from "../lib/manual-utils.js";
import {
    applyManualEnvOptionOverrides,
    MANUAL_REF_ENV_VAR,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    IDENTIFIER_VM_TIMEOUT_ENV_VAR
} from "../lib/manual-env.js";
import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    resolveProgressBarWidth,
    getDefaultProgressBarWidth
} from "../lib/progress-bar.js";
import { resolveVmEvalTimeout } from "../lib/vm-eval-timeout.js";
import { resolveManualCommandOptions } from "../lib/manual-command-options.js";

describe("manual option helpers", () => {
    describe("normalizeManualRepository", () => {
        it("trims input before validating repository segments", () => {
            assert.equal(
                normalizeManualRepository(
                    " TwoScoopStudio/GameMaker-Manual \n"
                ),
                "TwoScoopStudio/GameMaker-Manual"
            );
        });

        it("rejects repositories that do not contain an owner and name", () => {
            assert.equal(normalizeManualRepository("TwoScoopStudio"), null);
        });
    });

    describe("buildManualRepositoryEndpoints", () => {
        it("falls back to the default repository when none is provided", () => {
            const endpoints = buildManualRepositoryEndpoints();
            assert.equal(endpoints.manualRepo, DEFAULT_MANUAL_REPO);
            assert.equal(
                endpoints.apiRoot,
                `https://api.github.com/repos/${DEFAULT_MANUAL_REPO}`
            );
            assert.equal(
                endpoints.rawRoot,
                `https://raw.githubusercontent.com/${DEFAULT_MANUAL_REPO}`
            );
        });

        it("trims repository input before deriving endpoint URLs", () => {
            const endpoints = buildManualRepositoryEndpoints(
                " TwoScoopStudio/GameMaker-Manual "
            );

            assert.equal(
                endpoints.manualRepo,
                "TwoScoopStudio/GameMaker-Manual"
            );
        });

        it("throws when provided repository metadata is invalid", () => {
            assert.throws(
                () => buildManualRepositoryEndpoints("TwoScoopStudio"),
                /Invalid manual repository provided: TwoScoopStudio/
            );
        });
    });

    describe("resolveManualRepoValue", () => {
        it("normalizes string inputs and preserves the expected error message", () => {
            assert.equal(
                resolveManualRepoValue(" TwoScoopStudio/GameMaker-Manual "),
                "TwoScoopStudio/GameMaker-Manual"
            );

            assert.throws(
                () => resolveManualRepoValue(42, { source: "cli" }),
                /Manual repository must be provided in 'owner\/name' format \(received '42'\)\./
            );
        });
    });

    describe("resolveManualCacheRoot", () => {
        const repoRoot = path.resolve("/repo/root");

        it("uses a trimmed cache override when provided", () => {
            const env = {
                [MANUAL_CACHE_ROOT_ENV_VAR]: "  cache/manual  "
            };

            assert.equal(
                resolveManualCacheRoot({ repoRoot, env }),
                path.resolve(repoRoot, "cache/manual")
            );
        });

        it("falls back to the relative cache path when override is blank", () => {
            const env = { [MANUAL_CACHE_ROOT_ENV_VAR]: "   " };

            assert.equal(
                resolveManualCacheRoot({ repoRoot, env }),
                path.join(repoRoot, "scripts", "cache", "manual")
            );
        });
    });

    describe("resolveManualCommandOptions", () => {
        it("normalizes shared manual options with command defaults", () => {
            const command = {
                opts() {
                    return {};
                },
                helpInformation() {
                    return "usage details";
                }
            };

            const result = resolveManualCommandOptions(command, {
                defaults: {
                    ref: null,
                    outputPath: "/tmp/output.json",
                    cacheRoot: "/tmp/cache",
                    manualRepo: "Example/Manual"
                }
            });

            assert.deepStrictEqual(result, {
                ref: null,
                outputPath: "/tmp/output.json",
                forceRefresh: false,
                verbose: createManualVerboseState({
                    quiet: false,
                    isTerminal: process.stdout.isTTY === true
                }),
                progressBarWidth: getDefaultProgressBarWidth(),
                cacheRoot: "/tmp/cache",
                manualRepo: "Example/Manual",
                usage: "usage details"
            });
        });

        it("merges extras returned by the mapper and preserves explicit values", () => {
            const command = {
                opts() {
                    return {
                        ref: "release",
                        output: "/custom.json",
                        forceRefresh: true,
                        quiet: true,
                        progressBarWidth: 77,
                        cacheRoot: "/custom/cache",
                        manualRepo: "Example/Manual",
                        vmEvalTimeoutMs: 6500
                    };
                },
                helpInformation() {
                    return "usage details";
                }
            };

            const result = resolveManualCommandOptions(command, {
                defaults: {
                    outputPath: "/tmp/fallback.json",
                    cacheRoot: "/tmp/cache",
                    manualRepo: "Fallback/Manual"
                },
                mapExtras: ({ options }) => ({
                    vmEvalTimeoutMs:
                        options.vmEvalTimeoutMs === undefined
                            ? 1234
                            : options.vmEvalTimeoutMs,
                    extra: true
                })
            });

            assert.deepStrictEqual(result, {
                ref: "release",
                outputPath: "/custom.json",
                forceRefresh: true,
                verbose: createManualVerboseState({
                    quiet: true,
                    isTerminal: process.stdout.isTTY === true
                }),
                progressBarWidth: 77,
                cacheRoot: "/custom/cache",
                manualRepo: "Example/Manual",
                usage: "usage details",
                vmEvalTimeoutMs: 6500,
                extra: true
            });
        });
    });

    describe("resolveProgressBarWidth", () => {
        it("defaults to the configured width when no value is provided", () => {
            assert.equal(resolveProgressBarWidth(), DEFAULT_PROGRESS_BAR_WIDTH);
        });

        it("normalizes numeric string inputs", () => {
            assert.equal(resolveProgressBarWidth("  37  "), 37);
        });

        it("throws when provided with non-positive values", () => {
            assert.throws(() => resolveProgressBarWidth("0"), {
                name: "TypeError",
                message: /positive integer/i
            });
        });
    });

    describe("applyManualEnvOptionOverrides", () => {
        it("applies the standard manual overrides", () => {
            const calls = [];
            const command = {
                setOptionValueWithSource(...args) {
                    calls.push(args);
                }
            };

            applyManualEnvOptionOverrides({
                command,
                env: {
                    [MANUAL_REF_ENV_VAR]: " release ",
                    [MANUAL_REPO_ENV_VAR]: " Example/Manual ",
                    [PROGRESS_BAR_WIDTH_ENV_VAR]: "42"
                }
            });

            assert.deepEqual(calls, [
                ["ref", " release ", "env"],
                ["manualRepo", "Example/Manual", "env"],
                ["progressBarWidth", 42, "env"]
            ]);
        });

        it("appends additional overrides when provided", () => {
            const calls = [];
            const command = {
                setOptionValueWithSource(...args) {
                    calls.push(args);
                }
            };

            applyManualEnvOptionOverrides({
                command,
                env: { EXTRA: "value" },
                additionalOverrides: [
                    { envVar: "EXTRA", optionName: "extraOption" }
                ]
            });

            assert.deepEqual(calls, [["extraOption", "value", "env"]]);
        });

        it("supports overriding the VM evaluation timeout via the env helper", () => {
            const calls = [];
            const command = {
                setOptionValueWithSource(...args) {
                    calls.push(args);
                }
            };

            applyManualEnvOptionOverrides({
                command,
                env: { [IDENTIFIER_VM_TIMEOUT_ENV_VAR]: "6500" },
                additionalOverrides: [
                    {
                        envVar: IDENTIFIER_VM_TIMEOUT_ENV_VAR,
                        optionName: "vmEvalTimeoutMs",
                        resolveValue: resolveVmEvalTimeout
                    }
                ]
            });

            assert.deepEqual(calls, [["vmEvalTimeoutMs", 6500, "env"]]);
        });
    });
});
