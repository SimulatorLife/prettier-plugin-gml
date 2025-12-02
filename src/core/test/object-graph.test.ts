import assert from "node:assert/strict";
import test from "node:test";

import { walkObjectGraph } from "../src/ast/object-graph.js";

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
