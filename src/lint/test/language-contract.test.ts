import assert from "node:assert/strict";
import test from "node:test";

import { Lint } from "../src/index.js";

test("language parse returns ESLint v9 parse channel with ok discriminator", () => {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { text: string; filePath: string },
            context: unknown
        ) =>
            | { ok: true; ast: unknown; parserServices: unknown }
            | { ok: false; errors: ReadonlyArray<{ message: string; line: number; column: number }> };
    };

    const result = language.parse({ text: "var x = 1;", filePath: "test.gml" }, { languageOptions: {} });
    assert.equal(result.ok, true);
});
