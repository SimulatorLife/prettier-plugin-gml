import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, options = {}) {
    const result = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
    return result.trim();
}

describe("Banner comment centering", () => {
    it("centers a simple banner comment with configured length", async () => {
        const input = `//////// Banner comment
var value = 1;`;

        const expected = `//////////// Banner comment ////////////
var value = 1;`;

        const result = await formatWithPlugin(input, {
            lineCommentBannerLength: 40
        });

        assert.strictEqual(result, expected);
    });

    it("preserves original format when banner length is 0", async () => {
        const input = `//////// Banner comment
var value = 1;`;

        const expected = `//////// Banner comment
var value = 1;`;

        const result = await formatWithPlugin(input, {
            lineCommentBannerLength: 0
        });

        assert.strictEqual(result, expected);
    });

    it("handles banner with no text as pure slashes", async () => {
        const input = `////////
var value = 1;`;

        const expected = `////////////////////////////////////////
var value = 1;`;

        const result = await formatWithPlugin(input, {
            lineCommentBannerLength: 40
        });

        assert.strictEqual(result, expected);
    });

    it("extracts text from decorated banners", async () => {
        const input = `//////-------------------Move camera-----------------------//
var value = 1;`;

        const expected = `///////////// Move camera //////////////
var value = 1;`;

        const result = await formatWithPlugin(input, {
            lineCommentBannerLength: 40
        });

        assert.strictEqual(result, expected);
    });

    it("does not center regular comments below banner threshold", async () => {
        const input = `// Regular comment
var value = 1;`;

        const expected = `// Regular comment
var value = 1;`;

        const result = await formatWithPlugin(input, {
            lineCommentBannerLength: 40
        });

        assert.strictEqual(result, expected);
    });
});
