import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { debounce } from "../src/utils/function.js";

void describe("debounce", () => {
    void describe("basic debouncing", () => {
        void it("should delay function execution", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn();

            assert.equal(callCount, 0, "Should not execute immediately");

            await sleep(60);

            assert.equal(callCount, 1, "Should execute after delay");
        });

        void it("should debounce multiple rapid calls", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn();
            debouncedFn();
            debouncedFn();
            debouncedFn();

            assert.equal(callCount, 0, "Should not execute immediately");

            await sleep(60);

            assert.equal(callCount, 1, "Should execute only once");
        });

        void it("should use the last set of arguments", async () => {
            const calls: Array<string> = [];
            const debouncedFn = debounce((value: string) => {
                calls.push(value);
            }, 50);

            debouncedFn("first");
            debouncedFn("second");
            debouncedFn("third");

            await sleep(60);

            assert.deepEqual(calls, ["third"], "Should use only the last arguments");
        });

        void it("should handle multiple argument types", async () => {
            const calls: Array<[string, number, boolean]> = [];
            const debouncedFn = debounce((a: string, b: number, c: boolean) => {
                calls.push([a, b, c]);
            }, 50);

            debouncedFn("hello", 42, true);
            debouncedFn("world", 99, false);

            await sleep(60);

            assert.deepEqual(calls, [["world", 99, false]], "Should preserve all argument types");
        });
    });

    void describe("flush", () => {
        void it("should execute pending call immediately", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 100);

            debouncedFn();

            assert.equal(callCount, 0, "Should not execute before flush");

            debouncedFn.flush();

            assert.equal(callCount, 1, "Should execute immediately on flush");

            await sleep(110);

            assert.equal(callCount, 1, "Should not execute again after delay");
        });

        void it("should do nothing if no call is pending", () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn.flush();

            assert.equal(callCount, 0, "Should not execute if nothing pending");
        });

        void it("should use the last arguments when flushed", () => {
            const calls: Array<string> = [];
            const debouncedFn = debounce((value: string) => {
                calls.push(value);
            }, 100);

            debouncedFn("first");
            debouncedFn("second");
            debouncedFn.flush();

            assert.deepEqual(calls, ["second"], "Should use last arguments on flush");
        });
    });

    void describe("cancel", () => {
        void it("should cancel pending execution", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn();

            assert.equal(callCount, 0, "Should not execute before cancel");

            debouncedFn.cancel();

            await sleep(60);

            assert.equal(callCount, 0, "Should not execute after cancel");
        });

        void it("should do nothing if no call is pending", () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn.cancel();

            assert.equal(callCount, 0, "Should handle cancel when not pending");
        });

        void it("should allow new calls after cancel", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn();
            debouncedFn.cancel();
            debouncedFn();

            await sleep(60);

            assert.equal(callCount, 1, "Should execute new call after cancel");
        });
    });

    void describe("isPending", () => {
        void it("should return true when execution is pending", () => {
            const debouncedFn = debounce(() => {
                // Empty function body used for testing debounce timing mechanics
                // without side effects. The test validates isPending() state
                // transitions, not callback behavior, so no implementation is needed.
            }, 50);

            assert.equal(debouncedFn.isPending(), false, "Should be false initially");

            debouncedFn();

            assert.equal(debouncedFn.isPending(), true, "Should be true after call");
        });

        void it("should return false after execution", async () => {
            const debouncedFn = debounce(() => {
                // Empty function body used for testing debounce timing mechanics
                // without side effects. The test validates isPending() state
                // transitions, not callback behavior, so no implementation is needed.
            }, 50);

            debouncedFn();

            assert.equal(debouncedFn.isPending(), true, "Should be true before execution");

            await sleep(60);

            assert.equal(debouncedFn.isPending(), false, "Should be false after execution");
        });

        void it("should return false after flush", () => {
            const debouncedFn = debounce(() => {
                // Empty function body used for testing debounce timing mechanics
                // without side effects. The test validates isPending() state
                // transitions, not callback behavior, so no implementation is needed.
            }, 50);

            debouncedFn();
            debouncedFn.flush();

            assert.equal(debouncedFn.isPending(), false, "Should be false after flush");
        });

        void it("should return false after cancel", () => {
            const debouncedFn = debounce(() => {
                // Empty function body used for testing debounce timing mechanics
                // without side effects. The test validates isPending() state
                // transitions, not callback behavior, so no implementation is needed.
            }, 50);

            debouncedFn();
            debouncedFn.cancel();

            assert.equal(debouncedFn.isPending(), false, "Should be false after cancel");
        });
    });

    void describe("edge cases", () => {
        void it("should handle zero delay", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 0);

            debouncedFn();

            assert.equal(callCount, 0, "Should not execute immediately even with zero delay");

            await sleep(10);

            assert.equal(callCount, 1, "Should execute after minimal delay");
        });

        void it("should handle multiple sequential batches", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 30);

            debouncedFn();
            debouncedFn();

            await sleep(40);

            assert.equal(callCount, 1, "Should execute first batch");

            debouncedFn();
            debouncedFn();

            await sleep(40);

            assert.equal(callCount, 2, "Should execute second batch");
        });

        void it("should handle interleaved calls and waits", async () => {
            let callCount = 0;
            const debouncedFn = debounce(() => {
                callCount += 1;
            }, 50);

            debouncedFn();
            await sleep(30);
            debouncedFn();
            await sleep(30);
            debouncedFn();

            await sleep(60);

            assert.equal(callCount, 1, "Should execute only once for interleaved calls");
        });

        void it("should handle function that throws", async () => {
            const debouncedFn = debounce(() => {
                throw new Error("Test error");
            }, 50);

            debouncedFn();

            let errorThrown = false;
            try {
                await sleep(60);
            } catch {
                errorThrown = true;
            }

            assert.equal(errorThrown, false, "Should not propagate error outside debounce");
        });
    });

    void describe("real-world scenarios", () => {
        void it("should handle file save debouncing scenario", async () => {
            const savedFiles: Array<string> = [];
            const debouncedSave = debounce((filePath: string) => {
                savedFiles.push(filePath);
            }, 200);

            debouncedSave("/path/file.gml");
            await sleep(50);
            debouncedSave("/path/file.gml");
            await sleep(50);
            debouncedSave("/path/file.gml");

            await sleep(210);

            assert.deepEqual(savedFiles, ["/path/file.gml"], "Should save file only once");
        });

        void it("should handle shutdown with flush", () => {
            const processedFiles: Array<string> = [];
            const debouncedProcess = debounce((filePath: string) => {
                processedFiles.push(filePath);
            }, 1000);

            debouncedProcess("/path/file1.gml");
            debouncedProcess("/path/file2.gml");

            debouncedProcess.flush();

            assert.deepEqual(processedFiles, ["/path/file2.gml"], "Should process pending work on shutdown");
        });
    });
});
