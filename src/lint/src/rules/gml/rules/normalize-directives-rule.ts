import { Core } from "@gml-modules/core";
import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta, reportFullTextRewrite } from "../rule-base-helpers.js";

function isValidMacroIdentifier(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name);
}

/**
 * Strips a trailing semicolon from the macro VALUE portion of a string,
 * preserving any inline line comment that follows.
 *
 * Examples:
 *   "123456789;"       → "123456789"
 *   "2; // keep"       → "2 // keep"
 *   "2 // no semi"     → "2 // no semi"
 */
function stripMacroValueTrailingSemicolon(valueText: string): string {
    // Split off any inline line comment (// ...) so we don't touch it
    const commentIndex = valueText.indexOf("//");
    if (commentIndex !== -1) {
        const valuePart = valueText.slice(0, commentIndex).trimEnd();
        const commentPart = valueText.slice(commentIndex);
        const stripped = valuePart.endsWith(";") ? valuePart.slice(0, -1).trimEnd() : valuePart;
        return stripped.length > 0 ? `${stripped} ${commentPart}` : commentPart;
    }

    return valueText.endsWith(";") ? valueText.slice(0, -1).trimEnd() : valueText;
}

function normalizeDefineMacroLine(line: string): string {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("#define")) {
        return line;
    }

    const match = trimmed.match(/^(\s*)#define\s+(\S+)(.*)$/u);
    if (!match) {
        return line;
    }

    const [, leadingWhitespace, directiveName, remainder] = match;
    const newline = line.endsWith("\n") ? "\n" : "";

    // Handle #define region / #define end region
    if (/^region$/iu.test(directiveName ?? "")) {
        const regionName = remainder.trim();
        return `${leadingWhitespace ?? ""}#region ${regionName}${newline}`;
    }

    // Handle #define end region X or #define endregion X
    if (/^endregion$/iu.test(directiveName ?? "")) {
        const regionName = remainder.trim();
        return `${leadingWhitespace ?? ""}#endregion ${regionName}${newline}`;
    }

    // Handle the two-word form: `#define end region X` where directiveName="end"
    // and remainder starts with " region"
    if (/^end$/iu.test(directiveName ?? "") && /^\s+region(?:\s|$)/iu.test(remainder ?? "")) {
        const afterRegion = (remainder ?? "").replace(/^\s+region\s*/iu, "");
        const regionName = afterRegion.trim();
        return regionName.length > 0
            ? `${leadingWhitespace ?? ""}#endregion ${regionName}${newline}`
            : `${leadingWhitespace ?? ""}#endregion${newline}`;
    }

    // Handle valid macro identifiers
    if (isValidMacroIdentifier(directiveName ?? "")) {
        const trimmedRemainder = (remainder ?? "").trim();

        if (trimmedRemainder.length === 0) {
            return `${leadingWhitespace ?? ""}#macro ${directiveName ?? ""}${newline}`;
        }

        const cleanedValue = stripMacroValueTrailingSemicolon(trimmedRemainder);
        return `${leadingWhitespace ?? ""}#macro ${directiveName ?? ""} ${cleanedValue}${newline}`;
    }

    // Invalid macro identifier – leave as-is (normalizeLegacyDirectiveLine won't comment it out)
    return line;
}

function normalizeCommentedDirectiveLine(line: string): string {
    const match = line.match(/^(\s*)\/\/\s*#(region|endregion)\s*(.*)$/u);
    if (!match) {
        return line;
    }

    const [, leadingWhitespace, directive, name] = match;
    const trimmedName = (name ?? "").trim();

    if (trimmedName.length === 0) {
        return `${leadingWhitespace ?? ""}#${directive ?? ""}${line.endsWith("\n") ? "\n" : ""}`;
    }

    return `${leadingWhitespace ?? ""}#${directive ?? ""} ${trimmedName}${line.endsWith("\n") ? "\n" : ""}`;
}

/**
 * Converts GML 1.x-style `begin`/`end` block delimiters to `{`/`}` on a
 * single line.  Only standalone `begin`/`end` tokens that appear at a line
 * boundary are transformed; identifiers that contain those words (e.g.
 * `beginGame`) are left alone.
 */
function normalizeBeginEndLine(line: string): string {
    const newline = line.endsWith("\n") ? "\n" : "";
    const stripped = newline.length > 0 ? line.slice(0, -1) : line;

    // `begin` at end of line (optionally preceded by whitespace / code) → `{`
    const beginEndReplaced = stripped
        // "begin" as a trailing token after a statement (e.g. `if (x) begin`)
        .replace(/\bbegin\s*$/u, "{")
        // standalone `begin;` or `begin` on its own line
        .replace(/^(\s*)begin;?\s*$/u, "$1{")
        // `end` followed by optional comment → `}`
        .replace(/^(\s*)end(;?\s*(?:\/\/[^\n]*)?)$/u, (_, indent, suffix) => {
            const comment = /\/\//u.test(suffix ?? "") ? ` ${suffix.trim()}` : "";
            return `${indent as string}}${comment}`;
        });

    return beginEndReplaced + newline;
}

export function createNormalizeDirectivesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = Core.dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const rewrittenLines = lines.map((line, index) => {
                        let normalized = normalizeDefineMacroLine(line);
                        normalized = normalizeCommentedDirectiveLine(normalized);
                        normalized = normalizeBeginEndLine(normalized);

                        const isLastLine = index === lines.length - 1;
                        if (isLastLine && normalized.endsWith("\n")) {
                            normalized = normalized.slice(0, -1);
                        }

                        return normalized;
                    });

                    const rewritten = rewrittenLines.join(lineEnding);
                    reportFullTextRewrite(context, definition.messageId, text, rewritten);
                }
            });
        }
    });
}
