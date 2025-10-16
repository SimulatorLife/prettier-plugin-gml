import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { condenseLogicalExpressions } from "../src/ast-transforms/condense-logical-expressions.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function parse(source) {
    const { parsers } = await import(pluginPath);
    return await parsers["gml-parse"].parse(source, {});
}

test("condenses branches with unreachable expression statements", async () => {
    const source = [
        "function condense_with_unreachable(condition) {",
        "    if (condition) {",
        "        return true;",
        "        foo();",
        "    } else {",
        "        return false;",
        "        var ignored = 1;",
        "    }",
        "}",
        ""
    ].join("\n");

    const ast = await parse(source);
    const fn = ast.body[0];

    condenseLogicalExpressions(ast);

    assert.equal(fn.body.body.length, 1);
    const [returnStatement] = fn.body.body;
    assert.equal(returnStatement.type, "ReturnStatement");
    assert.equal(returnStatement.argument.type, "Identifier");
    assert.equal(returnStatement.argument.name, "condition");
});
