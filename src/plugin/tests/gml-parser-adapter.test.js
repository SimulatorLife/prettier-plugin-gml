import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gmlParserAdapter } from "../src/parsers/gml-parser-adapter.js";

describe("gml parser adapter", () => {
    const sourceWithMissingBrace = [
        "function func_args()",
        "{",
        "",
        "",
        "var value = argument[0];",
        "show_debug_message(value);",
        "return value;"
    ].join("\n");

    it("recovers when Feather fixes are enabled", async () => {
        const ast = await gmlParserAdapter.parse(sourceWithMissingBrace, {
            applyFeatherFixes: true
        });

        assert.ok(Array.isArray(ast?.body));
        assert.ok(ast.body.length > 0);

        const [declaration] = ast.body;
        assert.strictEqual(declaration?.type, "FunctionDeclaration");

        const blockStatements = declaration?.body?.body ?? [];
        assert.ok(Array.isArray(blockStatements));
        assert.ok(
            blockStatements.some(
                (node) => node?.type === "VariableDeclaration"
            ),
            "Expected recovered function block to contain original statements."
        );
    });

    it("propagates parser errors when Feather fixes are disabled", async () => {
        await assert.rejects(
            () => gmlParserAdapter.parse(sourceWithMissingBrace, {}),
            (error) =>
                typeof error?.message === "string" &&
                error.message
                    .toLowerCase()
                    .includes("missing associated closing brace"),
            "Expected parser to report missing closing brace without Feather recovery."
        );
    });
});
