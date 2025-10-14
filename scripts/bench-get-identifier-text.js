#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { getIdentifierText } from "../src/shared/ast-node-helpers.js";

const dataset = [
    "simple",
    { name: "identifier" },
    { type: "Identifier", name: "player" },
    {
        type: "MemberDotExpression",
        object: { type: "Identifier", name: "player" },
        property: { type: "Identifier", name: "x" }
    },
    {
        type: "MemberIndexExpression",
        object: { type: "Identifier", name: "inventory" },
        property: [
            {
                type: "Literal",
                value: "potion"
            }
        ]
    },
    {
        type: "MemberIndexExpression",
        object: { type: "Identifier", name: "grid" },
        property: [
            {
                type: "MemberDotExpression",
                object: { type: "Identifier", name: "position" },
                property: { type: "Identifier", name: "x" }
            }
        ]
    }
];

const iterations = 5_000_000;
let checksum = 0;

const start = performance.now();
for (let index = 0; index < iterations; index += 1) {
    const node = dataset[index % dataset.length];
    const result = getIdentifierText(node);
    if (typeof result === "string") {
        checksum += result.length;
    }
}
const duration = performance.now() - start;

console.log(JSON.stringify({ iterations, checksum, duration }));
