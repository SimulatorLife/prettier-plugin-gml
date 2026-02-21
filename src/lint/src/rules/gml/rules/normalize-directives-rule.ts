import type { Rule } from "eslint";

import type { GmlRuleDefinition } from "../../catalog.js";
import { createMeta } from "../rule-base-helpers.js";
import { dominantLineEnding } from "../rule-helpers.js";

function isValidMacroIdentifier(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name);
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

    // Handle #define region / #define end region
    const regionMatch = directiveName.match(/^region$/i);
    if (regionMatch) {
        const regionName = remainder.trim();
        return `${leadingWhitespace ?? ""}#region ${regionName}${line.endsWith("\n") ? "\n" : ""}`;
    }

    const endRegionMatch = directiveName.match(/^end\s*region|endregion$/i);
    if (endRegionMatch) {
        const regionName = remainder.trim();
        return `${leadingWhitespace ?? ""}#endregion ${regionName}${line.endsWith("\n") ? "\n" : ""}`;
    }

    // Handle valid macro identifiers
    if (isValidMacroIdentifier(directiveName)) {
        const trimmedRemainder = remainder.trim();

        if (trimmedRemainder.length === 0) {
            return `${leadingWhitespace ?? ""}#macro ${directiveName}${line.endsWith("\n") ? "\n" : ""}`;
        }

        return `${leadingWhitespace ?? ""}#macro ${directiveName} ${trimmedRemainder}${line.endsWith("\n") ? "\n" : ""}`;
    }

    // Invalid macro identifier - leave as-is to be commented out by normalizeLegacyDirectiveLine
    return line;
}

function normalizeCommentedDirectiveLine(line: string): string {
    const match = line.match(/^(\s*)\/\/\s*#(region|endregion)\s*(.*)$/u);
    if (!match) {
        return line;
    }

    const [, leadingWhitespace, directive, name] = match;
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
        return `${leadingWhitespace ?? ""}#${directive}${line.endsWith("\n") ? "\n" : ""}`;
    }

    return `${leadingWhitespace ?? ""}#${directive} ${trimmedName}${line.endsWith("\n") ? "\n" : ""}`;
}

function normalizeLegacyDirectiveLine(line: string): string {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") && !trimmed.startsWith("#macro")) {
        const parts = trimmed.split(/\s+/u);
        const name = parts[0]?.slice(1);
        if (name === "if" || name === "elseif" || name === "else" || name === "endif") {
            return line;
        }

        if (name === "region" || name === "endregion") {
            return line;
        }

        if (name === "define") {
            const macroName = parts[1];
            if (macroName && isValidMacroIdentifier(macroName)) {
                return line;
            }

            return line.replace(/^(\s*)#(.*)$/u, "$1//$2");
        }

        return line.replace(/^(\s*)#(.*)$/u, "$1//$2");
    }

    return line;
}

export function createNormalizeDirectivesRule(definition: GmlRuleDefinition): Rule.RuleModule {
    return Object.freeze({
        meta: createMeta(definition),
        create(context) {
            return Object.freeze({
                Program() {
                    const text = context.sourceCode.text;
                    const lineEnding = dominantLineEnding(text);
                    const lines = text.split(/\r?\n/u);
                    const rewrittenLines = lines.map((line, index) => {
                        let normalized = normalizeDefineMacroLine(line);
                        normalized = normalizeCommentedDirectiveLine(normalized);
                        normalized = normalizeLegacyDirectiveLine(normalized);

                        const isLastLine = index === lines.length - 1;
                        if (isLastLine && normalized.endsWith("\n")) {
                            normalized = normalized.slice(0, -1);
                        }

                        return normalized;
                    });

                    const rewritten = rewrittenLines.join(lineEnding);
                    if (rewritten !== text) {
                        context.report({
                            loc: { line: 1, column: 0 },
                            messageId: definition.messageId,
                            fix: (fixer) => fixer.replaceTextRange([0, text.length], rewritten)
                        });
                    }
                }
            });
        }
    });
}
