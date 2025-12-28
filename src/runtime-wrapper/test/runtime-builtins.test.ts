import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import * as Core from "@gml-modules/core";

const FUNCTION_DECLARATION_PATTERN =
    /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
const FUNCTION_ASSIGNMENT_PATTERN =
    /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*function\b/g;

function collectRuntimeFunctionNames(functionDir: string): Set<string> {
    const names = new Set<string>();
    const entries = fs.readdirSync(functionDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".js")) {
            continue;
        }

        const filePath = path.join(functionDir, entry.name);
        const contents = fs.readFileSync(filePath, "utf8");

        for (const pattern of [
            FUNCTION_DECLARATION_PATTERN,
            FUNCTION_ASSIGNMENT_PATTERN
        ]) {
            for (const match of contents.matchAll(pattern)) {
                const name = match[1];
                if (name) {
                    names.add(name);
                }
            }
        }
    }

    return names;
}

void test("manual built-in functions are defined in the HTML5 runtime", () => {
    const repoRoot = Core.Core.findRepoRootSync(process.cwd());
    const functionDir = path.join(
        repoRoot,
        "vendor",
        "GameMaker-HTML5",
        "scripts",
        "functions"
    );

    assert.ok(
        fs.existsSync(functionDir),
        "HTML5 runtime function sources are missing. Initialize vendor/GameMaker-HTML5."
    );

    const runtimeFunctions = collectRuntimeFunctionNames(functionDir);
    const manualFunctions = Core.Core.loadManualFunctionNames();

    const missing = Array.from(manualFunctions).filter(
        (name) => !runtimeFunctions.has(name)
    );

    assert.equal(
        missing.length,
        0,
        `Missing runtime definitions for manual functions: ${missing
            .slice(0, 25)
            .join(", ")}`
    );
});
