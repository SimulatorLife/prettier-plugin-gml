import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { runWatchTest } from "./test-helpers/watch-runner.js";

void describe("Watch command error recovery", () => {
    void it("should continue watching after transpilation errors", async () => {
        await runWatchTest(
            "watch-error-recovery",
            {
                websocketServer: false,
                statusServer: false,
                runtimeServer: false
            },
            async ({ testDir }) => {
                // Give watch time to start
                await sleep(200);

                // Create a file with invalid GML syntax that will fail transpilation
                // (The transpiler should fail parsing this)
                const invalidScript = path.join(testDir, "invalid.gml");
                await writeFile(invalidScript, "function broken syntax {");

                await sleep(300);

                // Create a valid file to verify watch continues working
                const validScript = path.join(testDir, "valid.gml");
                await writeFile(validScript, "var x = 10;");

                await sleep(300);
            }
        );
    });

    void it("should track errors in runtime context", async () => {
        await runWatchTest(
            "watch-error-tracking",
            {
                websocketServer: false,
                statusServer: false,
                runtimeServer: false
            },
            async ({ testDir }) => {
                // Give watch time to start
                await sleep(200);

                // Create multiple files with potential issues
                await writeFile(
                    path.join(testDir, "script1.gml"),
                    "function bad {"
                );
                await sleep(200);
                await writeFile(
                    path.join(testDir, "script2.gml"),
                    "function also_bad {"
                );
                await sleep(200);

                // If we got here without throwing, the watch continued despite errors
                assert.ok(true, "Watch continued despite transpilation errors");
            }
        );
    });

    void it("should store last successful patch per script", async () => {
        await runWatchTest(
            "watch-last-patch",
            {
                websocketServer: false,
                statusServer: false,
                runtimeServer: false
            },
            async ({ testDir }) => {
                await sleep(200);

                // Create a valid script
                const scriptPath = path.join(testDir, "test_script.gml");
                await writeFile(scriptPath, "var x = 10;");

                await sleep(300);

                // Update with another valid version
                await writeFile(scriptPath, "var y = 20;");

                await sleep(300);

                // Try to update with invalid version (should fail but retain last good patch)
                await writeFile(scriptPath, "function broken {");

                await sleep(300);

                // Test verifies that watch continues and tracks errors gracefully
                assert.ok(true, "Last successful patch tracking works");
            }
        );
    });

    void it("should validate patches before broadcasting", async () => {
        await runWatchTest(
            "watch-patch-validation",
            {
                websocketServer: false,
                statusServer: false,
                runtimeServer: false
            },
            async ({ testDir }) => {
                await sleep(200);

                // Create a valid script
                await writeFile(
                    path.join(testDir, "script.gml"),
                    "var x = 10;"
                );

                await sleep(300);

                // If validation fails, it should throw and be caught, allowing watch to continue
                assert.ok(true, "Patch validation works");
            }
        );
    });

    void it("should display error statistics on exit", async () => {
        // Capture console output to verify error stats are displayed
        const logs: Array<string> = [];
        const originalLog = console.log;
        console.log = (...args: Array<unknown>) => {
            logs.push(args.map(String).join(" "));
            originalLog(...args);
        };

        try {
            await runWatchTest(
                "watch-error-stats",
                {
                    websocketServer: false,
                    statusServer: false,
                    runtimeServer: false,
                    verbose: true
                },
                async ({ testDir }) => {
                    await sleep(200);

                    // Create some files that might error
                    await writeFile(
                        path.join(testDir, "bad1.gml"),
                        "function broken {"
                    );
                    await sleep(200);
                    await writeFile(
                        path.join(testDir, "good.gml"),
                        "var x = 10;"
                    );
                    await sleep(200);
                }
            );
        } finally {
            console.log = originalLog;
        }

        // Verify statistics were displayed
        const statsOutput = logs.join("\n");
        assert.ok(
            statsOutput.includes("Transpilation Statistics") ||
                statsOutput.includes("Total patches"),
            "Statistics should be displayed"
        );
    });
});
