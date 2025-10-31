import test from "node:test";
import { Worker } from "node:worker_threads";

// Ensure the plugin module resolves its default component bundle before any tests
// override the dependency provider. The component registry caches the initial
// bundle, so loading the plugin eagerly prevents concurrent tests from
// observing temporary dependency overrides.
import "../src/gml.js";

// Other plugin suites still override the dependency registry in-process, so keep
// the serial execution guard in place until they can be isolated as well.
process.env.NODE_TEST_NO_PARALLEL = "1";

const workerModuleUrl = new URL(
    "plugin-component-dependencies.worker.js",
    import.meta.url
);

function runWorkerTask(task) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerModuleUrl, {
            workerData: { task },
            type: "module"
        });

        worker.once("message", () => {
            resolve();
        });
        worker.once("error", (error) => {
            reject(error);
        });
        worker.once("exit", (code) => {
            if (code !== 0) {
                reject(new Error(`Worker exited with code ${code}`));
            }
        });
    });
}

test(
    "GML plugin component dependency registry",
    { concurrency: false },
    async (t) => {
        await t.test("exposes normalized defaults", () =>
            runWorkerTask("exposes-defaults")
        );

        await t.test("rejects non-function providers", () =>
            runWorkerTask("rejects-non-function")
        );

        await t.test("allows overriding dependency providers", () =>
            runWorkerTask("allows-overrides")
        );

        await t.test(
            "default component factory uses dependency overrides",
            () => runWorkerTask("components-use-overrides")
        );
    }
);
