import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
    createFetchRuntimeCommand,
    runFetchRuntimeCommand,
    __test__
} from "../src/commands/fetch-runtime.js";

describe("runtime fetch command", () => {
    it("creates a commander command with expected options", () => {
        const command = createFetchRuntimeCommand();

        assert.equal(command.name(), "runtime-fetch");
        assert.equal(
            command.description(),
            "Download and extract the HTML5 runtime into the local cache"
        );

        const optionNames = new Set(
            command.options.map((option) => option.long)
        );
        assert.ok(optionNames.has("--runtime-ref"));
        assert.ok(optionNames.has("--runtime-repo"));
        assert.ok(optionNames.has("--runtime-cache"));
        assert.ok(optionNames.has("--force-runtime-refresh"));
        assert.ok(optionNames.has("--verbose"));
    });

    it("invokes the runtime hydrator with derived options", async () => {
        const calls = [];
        const hydrationResult = {
            runtimeRepo: "Example/Repo",
            runtimeRef: { ref: "develop", sha: "abc123" },
            runtimeRoot: "/tmp/runtime",
            manifestPath: "/tmp/runtime/manifest.json",
            manifest: { version: 1 },
            downloaded: false,
            extracted: false
        };

        const runtimeHydrator = async (hydrationOptions) => {
            calls.push(hydrationOptions);
            return hydrationResult;
        };

        const logs = [];

        const result = await runFetchRuntimeCommand({
            runtimeRef: "develop",
            runtimeRepo: "Example/Repo",
            runtimeCache: "/tmp/cache",
            forceRuntimeRefresh: true,
            verbose: false,
            runtimeHydrator,
            logger: (line) => logs.push(line)
        });

        assert.equal(result, hydrationResult);
        assert.equal(calls.length, 1);

        const [call] = calls;
        assert.equal(call.runtimeRef, "develop");
        assert.equal(call.runtimeRepo, "Example/Repo");
        assert.equal(call.cacheRoot, "/tmp/cache");
        assert.equal(call.forceRefresh, true);
        assert.equal(
            call.userAgent,
            __test__.RUNTIME_CONTEXT_OPTIONS.userAgent
        );
        assert.equal(call.contextOptions, __test__.RUNTIME_CONTEXT_OPTIONS);
        assert.equal(call.verbose, undefined);

        assert.ok(
            logs.some((line) => line.includes("HTML5 runtime repository"))
        );
        assert.ok(
            logs.some((line) => line.includes("Runtime assets available"))
        );
    });
});
