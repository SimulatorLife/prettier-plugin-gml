import assert from "node:assert/strict";
import { Plugin } from "../src/index.js";
import { test } from "node:test";

function extractDocBlocks(text) {
    const blocks = [];
    let currentBlock = [];

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (trimmed.startsWith("///")) {
            currentBlock.push(trimmed);
            continue;
        }

        if (currentBlock.length > 0) {
            blocks.push(currentBlock);
            currentBlock = [];
        }
    }

    if (currentBlock.length > 0) {
        blocks.push(currentBlock);
    }

    return blocks;
}

void test("struct static functions drop stray @param tags when no parameters", async () => {
    const source = `function container() constructor {
    /// @param {real} width
    /// @description Each call generates layout
    /// @returns {undefined}
    static generate = function() {
        return;
    };
}`;

    const formatted = await Plugin.format(source);
    console.log(`FORMATTED OUTPUT:\n${formatted}`);

    const docBlocks = extractDocBlocks(formatted);
    const generateBlock = docBlocks.find((block) =>
        block.includes("/// @description Each call generates layout")
    );

    assert.ok(generateBlock, "Expected to find doc block for generate().");
    assert.deepEqual(generateBlock, [
        "/// @description Each call generates layout",
        "/// @returns {undefined}"
    ]);
});

void test("struct static functions keep implicit argument docs", async () => {
    const source = `function container() constructor {
    /// @param {real} argument0
    /// @description Example description
    /// @returns {real}
    static dispatch = function() {
        return argument[0];
    };
}`;

    const formatted = await Plugin.format(source);
    console.log(`FORMATTED OUTPUT:\n${formatted}`);

    const docBlocks = extractDocBlocks(formatted);
    const dispatchBlock = docBlocks.find(
        (block) =>
            block.includes("/// @param {real} argument0")
    );

    assert.ok(
        dispatchBlock,
        "Expected to find doc block for dispatch() with retained params."
    );
});
