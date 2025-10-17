import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { collectAncestorDirectories } from "../lib/ancestor-directories.js";

test("collectAncestorDirectories orders and deduplicates ancestors", () => {
    const projectRoot = path.join(process.cwd(), "tmp", "cli-path-utils");
    const nestedFeature = path.join(projectRoot, "src", "features", "core");
    const nestedSibling = path.join(projectRoot, "src", "features", "extras");

    const result = collectAncestorDirectories(nestedFeature, nestedSibling);

    const firstChain = [];
    let current = path.resolve(nestedFeature);
    while (true) {
        firstChain.push(current);
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    const secondChain = [];
    current = path.resolve(nestedSibling);
    while (true) {
        secondChain.push(current);
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    const expected = firstChain.concat(
        secondChain.filter((directory) => !firstChain.includes(directory))
    );

    assert.deepStrictEqual(result, expected);
    assert.strictEqual(new Set(result).size, result.length);
    assert.ok(result.includes(path.parse(result[0]).root));
});

test("collectAncestorDirectories skips empty inputs", () => {
    const projectRoot = path.join(process.cwd(), "tmp", "cli-path-utils");
    const result = collectAncestorDirectories(null, undefined, "", projectRoot);

    assert.strictEqual(result[0], path.resolve(projectRoot));
});
