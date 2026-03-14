import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const CURRENT_DIR = path.dirname(CURRENT_FILE);
const PRINTER_SOURCE_PATH = path.resolve(CURRENT_DIR, "../../src/printer/print.ts");

void it("does not depend on lint-owned synthetic doc comment fields", async () => {
    const source = await readFile(PRINTER_SOURCE_PATH, "utf8");

    assert.doesNotMatch(
        source,
        /_syntheticDocLines/,
        "Formatter must not branch on lint-owned synthetic doc fields; semantic/doc synthesis belongs to lint."
    );
});
