/**
 * Helpers for detecting and reporting duplicate or trailing semicolons in GML code.
 *
 * This module handles semicolon-related Feather diagnostics, including:
 * - Duplicate consecutive semicolons (GM1033)
 * - Trailing semicolons in macro declarations (GM1051)
 */
import { Core } from "@gml-modules/core";

import {
    attachFeatherFixMetadata,
    createFeatherFixDetail,
    hasFeatherSourceTextContext,
    visitFeatherAST
} from "./utils.js";

/**
 * Pattern matching trailing semicolons in macro declarations.
 *
 * Matches a semicolon followed by optional whitespace, block comments, line comments,
 * and a line terminator or end of input. This ensures we only remove semicolons that
 * appear at the end of a macro definition, not semicolons within the macro body.
 */
export const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    String.raw`;(?=[^\S\r\n]*(?:/\*[\s\S]*?\*/[^\S\r\n]*)*(?://[^\r\n]*)?(?:\r?\n|$))`
);

/**
 * Scan the AST/source text for consecutive semicolons and produce metadata consumable by the plugin.
 */
export function removeDuplicateSemicolons({ ast, sourceText, diagnostic }) {
    if (!hasFeatherSourceTextContext(ast, diagnostic, sourceText)) {
        return [];
    }

    const fixes = [];
    const recordedRanges = new Set();

    const recordFix = (container, range) => {
        if (!range || typeof range.start !== "number" || typeof range.end !== "number") {
            return;
        }

        const key = `${range.start}:${range.end}`;
        if (recordedRanges.has(key)) {
            return;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: null,
            range
        });

        if (!fixDetail) {
            return;
        }

        recordedRanges.add(key);
        fixes.push(fixDetail);

        if (container && typeof container === "object") {
            attachFeatherFixMetadata(container, [fixDetail]);
        }
    };

    const processSegment = (container, startIndex, endIndex) => {
        if (typeof startIndex !== "number" || typeof endIndex !== "number") {
            return;
        }

        if (endIndex <= startIndex) {
            return;
        }

        const segment = sourceText.slice(startIndex, endIndex);

        if (!segment || !segment.includes(";")) {
            return;
        }

        for (const range of findDuplicateSemicolonRanges(segment, startIndex)) {
            recordFix(container, range);
        }
    };

    const processStatementList = (container, statements) => {
        if (!Core.isNonEmptyArray(statements)) {
            return;
        }

        const bounds = getStatementListBounds(container, sourceText);

        let previousEnd = bounds.start;

        for (const statement of statements) {
            const statementStart = Core.getNodeStartIndex(statement);
            const statementEnd = Core.getNodeEndIndex(statement);

            if (typeof previousEnd === "number" && typeof statementStart === "number") {
                processSegment(container, previousEnd, statementStart);
            }

            previousEnd = typeof statementEnd === "number" ? statementEnd : statementStart;
        }

        if (typeof previousEnd === "number" && typeof bounds.end === "number") {
            processSegment(container, previousEnd, bounds.end);
        }
    };

    visitFeatherAST(ast, (node) => {
        switch (node.type) {
            case "BlockStatement": {
                processStatementList(node, node.body);

                break;
            }
            case "Program": {
                processStatementList(node, node.body);

                break;
            }
            case "SwitchCase": {
                processStatementList(node, node.consequent);

                break;
            }
            // No default
        }
    });

    return fixes;
}

/** Identify ranges containing duplicated semicolons while respecting comments and strings. */
export function findDuplicateSemicolonRanges(segment, offset) {
    const ranges = [];

    if (typeof segment !== "string" || segment.length === 0) {
        return ranges;
    }

    let runStart = -1;
    let runLength = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString = false;
    let stringDelimiter = null;

    for (let index = 0; index < segment.length; index += 1) {
        const char = segment[index];
        const nextChar = index + 1 < segment.length ? segment[index + 1] : "";

        if (inString) {
            if (char === "\\") {
                index += 1;
                continue;
            }

            if (char === stringDelimiter) {
                inString = false;
                stringDelimiter = null;
            }

            continue;
        }

        if (inLineComment) {
            if (char === "\n" || char === "\r") {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && nextChar === "/") {
                inBlockComment = false;
                index += 1;
                continue;
            }
            continue;
        }

        if (char === "/" && nextChar === "/") {
            inLineComment = true;
            index += 1;
            continue;
        }

        if (char === "/" && nextChar === "*") {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringDelimiter = char;
            continue;
        }

        if (char === ";") {
            if (runStart === -1) {
                runStart = index;
                runLength = 1;
            } else {
                runLength += 1;
            }
            continue;
        }

        if (runStart !== -1 && runLength > 1) {
            ranges.push({
                start: offset + runStart + 1,
                end: offset + runStart + runLength
            });
        }

        runStart = -1;
        runLength = 0;
    }

    if (runStart !== -1 && runLength > 1) {
        ranges.push({
            start: offset + runStart + 1,
            end: offset + runStart + runLength
        });
    }

    return ranges;
}

function getStatementListBounds(node, sourceText) {
    if (!node || typeof sourceText !== "string") {
        return { start: null, end: null };
    }

    let start = Core.getNodeStartIndex(node);
    let end = Core.getNodeEndIndex(node);

    switch (node.type) {
        case "Program": {
            start = 0;
            end = sourceText.length;

            break;
        }
        case "BlockStatement": {
            if (typeof start === "number" && sourceText[start] === "{") {
                start += 1;
            }

            if (typeof end === "number" && sourceText[end - 1] === "}") {
                end -= 1;
            }

            break;
        }
        case "SwitchCase": {
            if (typeof start === "number") {
                const colonIndex = findCharacterInRange(sourceText, ":", start, end);

                if (colonIndex !== -1) {
                    start = colonIndex + 1;
                }
            }

            break;
        }
        // Omit a default case because this switch only adjusts the start/end
        // boundaries for specific node types (Program, BlockStatement,
        // SwitchCase). All other AST nodes retain their original indices from
        // Core.getNodeStartIndex/Core.getNodeEndIndex, which are initialized above the
        // switch. Adding a redundant default branch would obscure the
        // intentional pass-through for the majority of statement containers.
    }

    return {
        start: typeof start === "number" ? start : null,
        end: typeof end === "number" ? end : null
    };
}

function findCharacterInRange(text, character, start, end) {
    if (typeof start !== "number") {
        return -1;
    }

    const limit = typeof end === "number" ? end : text.length;
    const index = text.indexOf(character, start);

    if (index === -1 || index >= limit) {
        return -1;
    }

    return index;
}

/**
 * Remove trailing semicolons from macro declarations.
 *
 * GameMaker's macro preprocessor automatically appends a semicolon during macro
 * expansion. If the macro definition itself ends with a semicolon, this creates
 * double-termination, causing syntax errors or unexpected expression boundaries.
 *
 * This function identifies macros ending with semicolons and removes them, updating
 * the AST and attaching fix metadata for Feather diagnostic GM1051.
 *
 * @param ast - The program AST node
 * @param sourceText - Original source code text
 * @param diagnostic - Feather diagnostic information
 * @returns Array of fix details describing the semicolon removals
 */
export function removeTrailingMacroSemicolons({ ast, sourceText, diagnostic }) {
    if (!hasFeatherSourceTextContext(ast, diagnostic, sourceText)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (Core.isMacroDeclarationNode(node)) {
            const fixInfo = sanitizeMacroDeclaration(node, sourceText, diagnostic);
            if (fixInfo) {
                registerSanitizedMacroName(ast, Core.getIdentifierText(node.name));
                fixes.push(fixInfo);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

/**
 * Sanitize a single macro declaration by removing its trailing semicolon.
 *
 * @param node - Macro declaration AST node
 * @param sourceText - Original source text
 * @param diagnostic - Feather diagnostic information
 * @returns Fix detail if semicolon was removed, null otherwise
 */
function sanitizeMacroDeclaration(node, sourceText, diagnostic) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const tokens = Array.isArray(node.tokens) ? node.tokens : null;
    if (!tokens || tokens.length === 0) {
        return null;
    }

    const lastToken = tokens.at(-1);
    if (lastToken !== ";") {
        return null;
    }

    const startIndex = node.start?.index;
    const endIndex = node.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const originalText = sourceText.slice(startIndex, endIndex + 1);

    // Remove trailing semicolons from Feather macro definitions because the macro
    // preprocessor already appends a semicolon during expansion. Leaving the source
    // semicolon in place would double-terminate statements, causing syntax errors
    // or unexpected expression boundaries. We only strip semicolons at the macro's
    // end to preserve semicolons that appear within the macro body itself.
    const sanitizedText = originalText.replace(TRAILING_MACRO_SEMICOLON_PATTERN, "");

    if (sanitizedText === originalText) {
        return null;
    }

    node.tokens = tokens.slice(0, -1);
    node._featherMacroText = sanitizedText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

/**
 * Register a macro name as having been sanitized.
 *
 * Maintains a set on the Program AST node tracking which macros have had
 * their trailing semicolons removed, allowing downstream tooling to know
 * which macros have been processed.
 *
 * @param ast - Program AST node
 * @param macroName - Name of the sanitized macro
 */
function registerSanitizedMacroName(ast, macroName) {
    if (!ast || typeof ast !== "object" || ast.type !== "Program") {
        return;
    }

    if (typeof macroName !== "string" || macroName.length === 0) {
        return;
    }

    const registry = Core.ensureSet(ast._featherSanitizedMacroNames);

    registry.add(macroName);
    ast._featherSanitizedMacroNames = registry;
}
