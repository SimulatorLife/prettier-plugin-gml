import assert from "node:assert/strict";
import test from "node:test";

import { walkObjectGraph, walkAst } from "../src/ast/object-graph.js";

void test("walkObjectGraph visits each object once even with cycles", () => {
    const shared: Record<string, unknown> & { value: number } = { value: 1 };
    const root = {
        left: { nested: shared },
        right: { nested: shared },
        array: [shared]
    };

    shared.self = root;

    const visited = new Set();

    walkObjectGraph(root, {
        enterObject(node) {
            visited.add(node);
        }
    });

    assert.ok(visited.has(root));
    assert.ok(visited.has(shared));
    assert.equal(visited.size, 4);
});

void test("walkAst visits only AST nodes with parent and key context", () => {
    const ast = {
        type: "Program",
        body: [
            {
                type: "FunctionDeclaration",
                id: { type: "Identifier", name: "test" },
                params: [{ type: "Identifier", name: "arg" }]
            }
        ]
    };

    const visited: Array<{ type: string; parent: unknown; key: string | number | null }> = [];

    walkAst(ast, (node, parent, key) => {
        visited.push({ type: node.type, parent, key });
    });

    // Should visit Program, FunctionDeclaration, both Identifiers
    assert.equal(visited.length, 4);
    assert.equal(visited[0].type, "Program");
    assert.equal(visited[0].parent, null);
    assert.equal(visited[0].key, null);

    assert.equal(visited[1].type, "FunctionDeclaration");
    assert.ok(Array.isArray(visited[1].parent));
    assert.equal(visited[1].key, 0);

    assert.equal(visited[2].type, "Identifier");
    assert.equal(visited[3].type, "Identifier");
});

void test("walkAst respects early termination signal", () => {
    const ast = {
        type: "Program",
        body: [
            {
                type: "FunctionDeclaration",
                id: { type: "Identifier", name: "test" },
                body: {
                    type: "BlockStatement",
                    body: [{ type: "ExpressionStatement" }]
                }
            }
        ]
    };

    const visited: string[] = [];

    walkAst(ast, (node) => {
        visited.push(node.type);
        // Don't descend into FunctionDeclaration
        if (node.type === "FunctionDeclaration") {
            return false;
        }
        return undefined;
    });

    // Should visit Program and FunctionDeclaration but not its children
    assert.equal(visited.length, 2);
    assert.deepEqual(visited, ["Program", "FunctionDeclaration"]);
});
