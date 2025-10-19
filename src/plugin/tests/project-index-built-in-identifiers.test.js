import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __loadBuiltInIdentifiersForTests as loadBuiltInIdentifiers } from "../src/project-index/index.js";

function createMockFsFacade({ contents, mtimeMs }) {
    return {
        async readFile(filePath, encoding) {
            assert.equal(encoding, "utf8");
            return typeof contents === "function"
                ? contents(filePath)
                : contents;
        },
        async stat() {
            return { mtimeMs };
        }
    };
}

describe("loadBuiltInIdentifiers", () => {
    it(
        "extracts identifier names when metadata is valid",
        { concurrency: false },
        async () => {
            const facade = createMockFsFacade({
                contents: JSON.stringify(
                    {
                        identifiers: {
                            demo: { type: "function" },
                            other: { type: "variable" }
                        }
                    },
                    null,
                    4
                ),
                mtimeMs: 1
            });

            const result = await loadBuiltInIdentifiers(facade);

            assert.deepStrictEqual([...result.names].sort(), ["demo", "other"]);
        }
    );

    it(
        "ignores malformed identifier payloads",
        { concurrency: false },
        async () => {
            const facade = createMockFsFacade({
                contents: JSON.stringify({ identifiers: "intruder" }),
                mtimeMs: 2
            });

            const result = await loadBuiltInIdentifiers(facade);

            assert.deepStrictEqual([...result.names], []);
        }
    );

    it(
        "skips entries with invalid descriptor shapes",
        { concurrency: false },
        async () => {
            const facade = createMockFsFacade({
                contents: JSON.stringify(
                    {
                        identifiers: {
                            good: { type: "function" },
                            bad: null,
                            emptyType: { type: "" }
                        }
                    },
                    null,
                    4
                ),
                mtimeMs: 3
            });

            const result = await loadBuiltInIdentifiers(facade);

            assert.deepStrictEqual([...result.names], ["good"]);
        }
    );
});
