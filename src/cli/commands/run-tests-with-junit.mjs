import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function ensureDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
}

function removeFile(filePath) {
    try {
        fs.unlinkSync(filePath);
    } catch (error) {
        if (error && error.code !== "ENOENT") {
            throw error;
        }
    }
}

function fileExistsAndHasContent(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile() && stats.size > 0;
    } catch {
        return false;
    }
}

function buildFallbackReport({ code, signal }) {
    const failureReason = signal
        ? `Test runner terminated by signal ${signal}.`
        : code === 0
          ? "Test runner completed without producing a report."
          : `Test runner exited with status ${code}.`;

    const failureMessage = `${failureReason} See step logs for additional details.`;

    return [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<testsuites>",
        '  <testsuite name="node-test-runner" tests="1" failures="1" errors="0" skipped="0">',
        '    <testcase name="node --test" classname="node-test-runner">',
        `      <failure message=\"${failureMessage}\">Generated fallback JUnit report because the test runner did not produce one.</failure>`,
        "    </testcase>",
        "  </testsuite>",
        "</testsuites>",
        ""
    ].join("\n");
}

async function runNodeTests(args) {
    const env = { ...process.env };
    if (env.NODE_TEST_CONTEXT) {
        delete env.NODE_TEST_CONTEXT;
    }

    return await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            env,
            stdio: "inherit"
        });

        child.on("error", (error) => {
            reject(error);
        });

        child.on("exit", (code, signal) => {
            resolve({ code, signal });
        });
    });
}

function writeFallbackReport(reportPath, result) {
    const fallback = buildFallbackReport(result);
    fs.writeFileSync(reportPath, `${fallback}`);
    const relative = path.relative(process.cwd(), reportPath) || reportPath;
    console.warn(
        `[test:report] Generated fallback JUnit report at ${relative} because the test runner did not produce one.`
    );
}

async function main() {
    const reportDirectory = path.resolve("reports");
    const reportFile = path.join(reportDirectory, "tests.xml");
    const extraArgs = process.argv.slice(2);
    const nodeArgs = [
        "--test",
        "--test-reporter=junit",
        `--test-reporter-destination=${reportFile}`,
        ...extraArgs
    ];

    ensureDirectory(reportDirectory);
    removeFile(reportFile);

    const forceFallback = process.env.FORCE_JUNIT_FALLBACK === "1";

    let result;
    if (forceFallback) {
        result = { code: 1, signal: null };
    } else {
        try {
            result = await runNodeTests(nodeArgs);
        } catch (error) {
            result = { code: 1, signal: null };
            console.error(
                `[test:report] Failed to execute Node test runner: ${error?.message ?? "Unknown error"}`
            );
        }
    }

    if (forceFallback || !fileExistsAndHasContent(reportFile)) {
        try {
            writeFallbackReport(reportFile, result);
        } catch (error) {
            console.error(
                `[test:report] Unable to write fallback JUnit report: ${error?.message ?? "Unknown error"}`
            );
        }
    }

    const exitCode = result?.signal ? 1 : (result?.code ?? 1);
    if (exitCode !== 0) {
        process.exitCode = exitCode;
    }
}

await main();
