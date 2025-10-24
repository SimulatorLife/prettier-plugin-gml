import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

const originalSkipRun = process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN;
process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN = "1";

const cliModulePromise = import("../cli.js");

async function loadCliTestUtilities() {
    const { __test__ } = await cliModulePromise;
    return __test__;
}

after(() => {
    if (originalSkipRun === undefined) {
        delete process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN;
        return;
    }

    process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN = originalSkipRun;
});

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
