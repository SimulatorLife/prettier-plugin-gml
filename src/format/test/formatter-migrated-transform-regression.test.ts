import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";

void describe("formatter migrated-transform regression coverage", () => {
    void it("does not apply semantic/content rewrites during formatting", async () => {
        const source = [
            "#macro VALUE 1;",
            "var cfg = {};",
            "cfg.foo = 1;",
            "cfg.bar = 2;",
            'var label = "HP: " + string(hp);',
            "var ratio = total / 2;",
            "globalvar score;",
            "score = 1;",
            "var item = lst_items[? 0];",
            "if ((ready && armed) || override) {",
            "    show_debug_message(label);",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.match(formatted, /#macro VALUE 1;/);
        assert.match(formatted, /cfg\.foo = 1;/);
        assert.match(formatted, /cfg\.bar = 2;/);
        assert.match(formatted, /"HP: " \+ string\(hp\)/);
        assert.match(formatted, /total \/ 2/);
        assert.match(formatted, /globalvar score;/);
        assert.match(formatted, /score = 1;/);
        assert.match(formatted, /lst_items\[\?\s*0]/);
        assert.doesNotMatch(formatted, /\$"HP:\s*\{hp\}"/);
        assert.doesNotMatch(formatted, /cfg\s*=\s*\{\s*foo:\s*1,\s*bar:\s*2\s*\}/);
        assert.doesNotMatch(formatted, /global\.score =/);
        assert.doesNotMatch(formatted, /lst_items\[\|\s*0]/);
    });

    void it("does not synthesize trailing optional defaults during formatting", async () => {
        const source = ["function demo(first, second = 1, third) {", "    return [first, second, third];", "}"].join(
            "\n"
        );
        const formatted = await Format.format(source);
        assert.match(formatted, /function demo\(first,\s*second = 1,\s*third\)/);
        assert.doesNotMatch(formatted, /third = undefined/);
    });

    void it("does not strip non-undefined default parameter values from function declarations", async () => {
        const source = [
            "/// @function scr_dq_get_conjugate(dq, target_dq)",
            "/// @param {array} dq",
            "/// @param {array} target_dq",
            "function scr_dq_get_conjugate(dq, target_dq = array_create(8)) {",
            "    return target_dq;",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.match(
            formatted,
            /function scr_dq_get_conjugate\(dq,\s*target_dq = array_create\(8\)\)/,
            "Formatter must preserve explicit non-undefined default expressions in function parameters."
        );
    });

    void it("does not synthesize doc-comment tags during formatting", async () => {
        const source = [
            "function make_struct(value) {",
            "var result = {alpha:1,beta:value,gamma:call()};",
            "return result;",
            "}"
        ].join("\n");
        const formatted = await Format.format(source);
        assert.doesNotMatch(formatted, /^\/\/\/ @/m);
        assert.match(formatted, /function make_struct\(value\)/);
    });

    void it("preserves legacy /// @function annotations (formatter must not normalize to newer tags)", async () => {
        const source = [
            "/// @function update_ground_dist(ray_len)",
            "/// @description Updates ground distance each step",
            "/// @param ray_len {real} The ray length",
            "function update_ground_dist(ray_len) {",
            "return ray_len;",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.match(
            formatted,
            /^\/\/\/ @function update_ground_dist\(ray_len\)/m,
            "Formatter must preserve legacy @function annotation text verbatim enough to keep tag ownership in lint."
        );
        assert.doesNotMatch(
            formatted,
            /^\/\/\/ @func update_ground_dist/m,
            "Formatter must not replace @function with alternate doc tags."
        );
    });

    void it("never synthesizes function doc-comments for declarations or function assignments", async () => {
        const source = [
            "function declared(alpha, beta) {",
            "return alpha + beta;",
            "}",
            "",
            "var assigned = function(gamma) {",
            "return gamma * 2;",
            "};"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.doesNotMatch(
            formatted,
            /^\/\/\/ @(?:description|function|func|param|returns?)\b/m,
            "Formatter must not synthesize any function doc-comment tags; this is lint-only behavior."
        );
        assert.match(formatted, /function declared\(alpha,\s*beta\)/);
        assert.match(formatted, /var assigned = function \(gamma\)/);
    });

    void it("does not promote plain leading comments into synthetic /// @description tags", async () => {
        const source = [
            "// This function computes a score.",
            "function compute_score(points) {",
            "return points;",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.match(formatted, /^\/\/ This function computes a score\./m);
        assert.doesNotMatch(
            formatted,
            /^\/\/\/ @description\b/m,
            "Formatter must not synthesize @description from plain leading comments."
        );
        assert.doesNotMatch(
            formatted,
            /^\/\/\/ @(?:function|func|param|returns?)\b/m,
            "Formatter must not synthesize function doc-comment tags."
        );
    });

    void it("fails fast on invalid syntax instead of repairing parse input", async () => {
        const malformedSource = 'if (ready) {\n    show_debug_message("x");\n';

        await assert.rejects(async () => {
            await Format.format(malformedSource);
        });
    });

    void it("never mutates malformed comment text as a parser recovery strategy", async () => {
        const malformedCommentSource = "/ @description not-valid-comment\nvar value = 1;";

        await assert.rejects(async () => {
            await Format.format(malformedCommentSource);
        });

        assert.strictEqual(malformedCommentSource, "/ @description not-valid-comment\nvar value = 1;");
    });

    void it("does not remove duplicate doc-comment lines (deduplication belongs in lint)", async () => {
        // Formatter must not perform content rewrites. Removing duplicate doc
        // comment lines is a semantic operation owned by `@gml-modules/lint`
        // (target-state.md §2.2, §3.2).
        const source = [
            "/// @description Updates the ground distance",
            "/// @description Updates the ground distance",
            "function update_ground_dist() {",
            "    return 1;",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);
        const docLineCount = (formatted.match(/\/\/\/ @description Updates the ground distance/g) ?? []).length;

        assert.strictEqual(
            docLineCount,
            2,
            "Formatter must not strip duplicate doc-comment lines — that is a lint-workspace responsibility"
        );
    });

    void it("does not collapse if-else-boolean-return patterns (simplification belongs in lint)", async () => {
        // The formatter must not perform semantic/content rewrites.
        // Converting `if (cond) { return true; } else { return false; }` to
        // `return cond;` is a structural simplification owned by the
        // `gml/optimize-logical-flow` lint rule (target-state.md §3.2).
        const source = [
            "function bool_passthrough(condition) {",
            "    if (condition) {",
            "        return true;",
            "    } else {",
            "        return false;",
            "    }",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.doesNotMatch(
            formatted,
            /return condition;/,
            "Formatter must not collapse if-else-boolean-return to a direct return — that is a lint-workspace responsibility (gml/optimize-logical-flow)"
        );
        assert.match(formatted, /if \(condition\)/, "Formatter must preserve the original if-else structure unchanged");
    });

    void it("does not collapse negated if-else-boolean-return patterns (simplification belongs in lint)", async () => {
        // The formatter must not perform semantic/content rewrites.
        // Converting `if (cond) { return false; } else { return true; }` to
        // `return !cond;` is a structural simplification owned by the
        // `gml/optimize-logical-flow` lint rule (target-state.md §3.2).
        const source = [
            "function bool_negated(condition) {",
            "    if (condition) {",
            "        return false;",
            "    } else {",
            "        return true;",
            "    }",
            "}"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.doesNotMatch(
            formatted,
            /return !condition;/,
            "Formatter must not collapse negated if-else-boolean-return to a negated return — that is a lint-workspace responsibility (gml/optimize-logical-flow)"
        );
        assert.match(formatted, /if \(condition\)/, "Formatter must preserve the original if-else structure unchanged");
    });
});
