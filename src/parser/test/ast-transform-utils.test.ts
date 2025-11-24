import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";
import {
    removeLocationMetadata,
    simplifyLocationMetadata,
    remapLocationMetadata
} from "../src/ast/location-manipulation.js";

test("walkObjectGraph visits each object once even with cycles", () => {
    const shared: MutableGameMakerAstNode = { value: 1 };
    const root: MutableGameMakerAstNode = {
        left: ({ nested: shared } as MutableGameMakerAstNode),
        right: ({ nested: shared } as MutableGameMakerAstNode),
        array: [shared]
    };

    shared.self = root;

    const visited = new Set();

    Core.walkObjectGraph(root, {
        enterObject(node) {
            visited.add(node);
        }
    });

    assert.ok(visited.has(root));
    assert.ok(visited.has(shared));
    assert.equal(visited.size, 4);
});

test("location metadata helpers mutate nested structures", () => {
    const ast: MutableGameMakerAstNode = {
        type: "Program",
        start: { index: 0 },
        end: { index: 4 },
        body: [
            {
                type: "Literal",
                start: 1,
                end: 3,
                extra: {
                    start: { index: 10 },
                    end: { index: 12 }
                }
            }
        ]
    };

    simplifyLocationMetadata(ast);
    assert.deepEqual(ast.start, 0);
    assert.deepEqual(ast.end, 4);
    assert.deepEqual((ast.body[0] as any).extra.start, 10);

    remapLocationMetadata(ast, (index) => index + 2);
    assert.deepEqual((ast.body[0] as any).start, 3);
    assert.deepEqual((ast.body[0] as any).extra.end, 14);

    removeLocationMetadata(ast);
    assert.ok(!Object.hasOwn(ast, "start"));
    assert.ok(!Object.hasOwn(ast, "end"));
    assert.ok(!Object.hasOwn(ast.body[0] as any, "start"));
    assert.ok(!Object.hasOwn(ast.body[0] as any, "end"));
});
