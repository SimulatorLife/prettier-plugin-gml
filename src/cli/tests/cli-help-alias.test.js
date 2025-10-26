import assert from "node:assert/strict";
import { describe, it } from "node:test";

const SKIP_CLI_ENV_VAR = "PRETTIER_PLUGIN_GML_SKIP_CLI_RUN";
const SKIP_CLI_ENV_VALUE = "1";

// The CLI module inspects the environment at import time to decide whether to
// execute. Keep the skip flag scoped to the import cycle so concurrent test
// files do not leak the override into unrelated scenarios.

let cliModulePromise;

async function ensureCliModuleLoaded() {
    if (!cliModulePromise) {
        const originalValue = process.env[SKIP_CLI_ENV_VAR];

        process.env[SKIP_CLI_ENV_VAR] = SKIP_CLI_ENV_VALUE;

        const cleanupEnvironment = () => {
            if (process.env[SKIP_CLI_ENV_VAR] !== SKIP_CLI_ENV_VALUE) {
                return;
            }

            if (originalValue === undefined) {
                delete process.env[SKIP_CLI_ENV_VAR];
            } else {
                process.env[SKIP_CLI_ENV_VAR] = originalValue;
            }
        };

        const moduleLoad = import("../cli.js")
            .finally(cleanupEnvironment)
            .catch((error) => {
                cliModulePromise = undefined;
                throw error;
            });

        cliModulePromise = moduleLoad;
    }

    return cliModulePromise;
}

async function loadCliTestUtilities() {
    const { __test__ } = await ensureCliModuleLoaded();
    return __test__;
}

describe("cli help command normalization", () => {
    it("passes through arguments when the command is not help", async () => {
        const { normalizeCommandLineArguments } = await loadCliTestUtilities();
        const argumentsForCli = ["format", "src/scripts"];
        const normalized = normalizeCommandLineArguments(argumentsForCli);

        assert.deepEqual(normalized, argumentsForCli);
        assert.notStrictEqual(normalized, argumentsForCli);
    });

    it("maps bare help commands to the --help flag", async () => {
        const { normalizeCommandLineArguments } = await loadCliTestUtilities();

        assert.deepEqual(normalizeCommandLineArguments(["help"]), ["--help"]);
    });

    it("converts help <command> into <command> --help", async () => {
        const { normalizeCommandLineArguments } = await loadCliTestUtilities();
        const normalized = normalizeCommandLineArguments(["help", "format"]);

        assert.deepEqual(normalized, ["format", "--help"]);
    });
});
