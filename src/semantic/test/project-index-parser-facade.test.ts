import assert from "node:assert/strict";
import test from "node:test";

import { resolveProjectIndexParser } from "../src/project-index/index.js";

void test("resolveProjectIndexParser prefers facade overrides", () => {
    const calls: Array<string> = [];
    const facade = {
        parse(sourceText: string) {
            calls.push(sourceText);
            return { ok: true };
        }
    };

    const parser = resolveProjectIndexParser({ gmlParserFacade: facade });

    const result = parser("test_source");

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, ["test_source"]);
});
