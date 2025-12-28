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

const EXPECTED_RUNTIME_FUNCTIONS = [
    "abs",
    "point_distance",
    "random",
    "irandom_range",
    "string_length",
    "string_upper",
    "string_lower",
    "string_replace",
    "clamp"
];

void test("HTML5 runtime defines core manual builtins used by hot reload", () => {
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

    for (const name of EXPECTED_RUNTIME_FUNCTIONS) {
        assert.ok(
            manualFunctions.has(name),
            `Manual metadata missing '${name}'`
        );
        assert.ok(
            runtimeFunctions.has(name),
            `HTML5 runtime missing '${name}'`
        );
    }
});
