import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Lint } from "@gml-modules/lint";

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
});
