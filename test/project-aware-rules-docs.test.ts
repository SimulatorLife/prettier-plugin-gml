import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Lint } from "@gml-modules/lint";

const rawDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory =
    path.basename(rawDirectory) === "dist"
        ? path.resolve(rawDirectory, "..", "..")
        : path.resolve(rawDirectory, "..");
const generatedProjectAwareRulesPath = path.join(rootDirectory, "docs", "generated", "project-aware-rules.md");

void describe("project-aware lint rule docs", () => {
    void it("derives project-aware rules from metadata", () => {
        assert.deepEqual(Lint.docs.collectProjectAwareRuleIds(), [
            "gml/no-globalvar",
            "gml/prefer-loop-length-hoist",
            "gml/prefer-string-interpolation",
            "gml/prefer-struct-literal-assignments"
        ]);
    });

    void it("renders stable markdown", () => {
        const markdown = Lint.docs.renderProjectAwareRulesMarkdown();
        assert.match(markdown, /^# Project-aware lint rules/m);
        assert.match(markdown, /Total rules: 4/);
        assert.match(markdown, /`gml\/no-globalvar`/);
    });

    void it("keeps checked-in generated docs in sync", () => {
        const expected = Lint.docs.renderProjectAwareRulesMarkdown();
        const checkedIn = fs.readFileSync(generatedProjectAwareRulesPath, "utf8");
        assert.equal(
            checkedIn,
            expected,
            "docs/generated/project-aware-rules.md is stale. Run `pnpm run generate:lint-rule-docs`."
        );
    });
});
