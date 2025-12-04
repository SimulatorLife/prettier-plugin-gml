import assert from "node:assert/strict";
import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { describe, it } from "node:test";

import { gmlParserAdapter } from "../src/parsers/gml-parser-adapter.js";

void describe("gml parser adapter", () => {
    const sourceWithMissingBrace = [
        "function func_args()",
        "{",
        "",
        "",
        "var value = argument[0];",
        "show_debug_message(value);",
        "return value;"
    ].join("\n");

    function findCall(root, calleeName) {
        if (!root || typeof root !== "object") {
            return null;
        }

        if (
            root.type === "CallExpression" &&
            root.object?.type === "Identifier" &&
            root.object.name === calleeName
        ) {
            return root;
        }

        for (const value of Object.values(root)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (const entry of value) {
                    const result = findCall(entry, calleeName);
                    if (result) {
                        return result;
                    }
                }
            } else {
                const result = findCall(value, calleeName);
                if (result) {
                    return result;
                }
            }
        }

        return null;
    }

    function normalizeNodeBody(
        node?: MutableGameMakerAstNode | null
    ): Array<MutableGameMakerAstNode> {
        if (!node || typeof node !== "object") {
            return [];
        }

        const candidate = (node as { body?: unknown }).body;
        const normalizedCandidate = candidate;
        if (!Array.isArray(normalizedCandidate)) {
            return [];
        }

        return normalizedCandidate as Array<MutableGameMakerAstNode>;
    }

    void it("recovers when Feather fixes are enabled", async () => {
        const ast = await gmlParserAdapter.parse(sourceWithMissingBrace, {
            applyFeatherFixes: true
        });

        assert.ok(Array.isArray(ast?.body));
        assert.ok(ast.body.length > 0);

        const [declaration] = normalizeNodeBody(
            ast
        );
        assert.strictEqual(declaration?.type, "FunctionDeclaration");

        const blockStatements = normalizeNodeBody(
            declaration?.body as unknown as MutableGameMakerAstNode | undefined
        );
        assert.ok(Array.isArray(blockStatements));
        assert.ok(
            blockStatements.some(
                (node) => node?.type === "VariableDeclaration"
            ),
            "Expected recovered function block to contain original statements."
        );
    });

    void it("propagates parser errors when Feather fixes are disabled", async () => {
        await assert.rejects(
            () => gmlParserAdapter.parse(sourceWithMissingBrace, {}),
            (error) =>
                typeof (error as any)?.message === "string" &&
                (error as any).message
                    .toLowerCase()
                    .includes("missing associated closing brace"),
            "Expected parser to report missing closing brace without Feather recovery."
        );
    });

    void it("parses scr_matrix_build calls that omit separators between numeric literals", async () => {
        const source = [
            "if (scr_matrix_build(1, 2 3, 4)) {",
            "    return 0;",
            "}"
        ].join("\n");

        const ast = await gmlParserAdapter.parse(source, {});
        assert.ok(ast);

        const call = findCall(ast, "scr_matrix_build");
        assert.ok(call, "Expected to locate scr_matrix_build call expression.");

        const values = call.arguments.map((argument) => argument?.value);
        assert.deepStrictEqual(values, ["1", "2", "3", "4"]);
        assert.strictEqual(call.preserveOriginalCallText, true);
    });

    void it("parses scr_matrix_build calls with inline comments between numeric literals", async () => {
        const source = [
            "if (scr_matrix_build(1, 2 /* note */ 3, 4)) {",
            "    return 1;",
            "}"
        ].join("\n");

        const ast = await gmlParserAdapter.parse(source, {});
        assert.ok(ast);

        const call = findCall(ast, "scr_matrix_build");
        assert.ok(call, "Expected to locate scr_matrix_build call expression.");

        const values = call.arguments.map((argument) => argument?.value);
        assert.deepStrictEqual(values, ["1", "2", "3", "4"]);
    });

    void it("parses generic calls that omit separators between numeric literals", async () => {
        const source = [
            "if (do_generic(0, 1 2, 3)) {",
            "    return 2;",
            "}"
        ].join("\n");

        const ast = await gmlParserAdapter.parse(source, {});
        assert.ok(ast);

        const call = findCall(ast, "do_generic");
        assert.ok(call, "Expected to locate do_generic call expression.");

        const values = call.arguments.map((argument) => argument?.value);
        assert.deepStrictEqual(values, ["0", "1", "2", "3"]);
        assert.strictEqual(call.preserveOriginalCallText, true);
    });
});
