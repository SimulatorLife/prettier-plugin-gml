import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

void test("MCP workspace scaffold declares the server package and plan", async () => {
    const packageJsonText = await readFile(path.join(WORKSPACE_ROOT, "package.json"), "utf8");
    const readmeText = await readFile(path.join(WORKSPACE_ROOT, "README.md"), "utf8");

    assert.match(packageJsonText, /"name": "@gmloop\/mcp"/);
    assert.match(packageJsonText, /"gmloop-mcp": "\.\/dist\/src\/main\.js"/);
    assert.match(readmeText, /## Full Implementation Plan/);
    assert.match(readmeText, /registerTool/);
});
