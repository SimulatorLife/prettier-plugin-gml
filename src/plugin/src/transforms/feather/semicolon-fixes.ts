/**
 * Helpers for detecting and reporting duplicate semicolons so Feather diagnostics can suggest cleanup.
 */
import { Core } from "@gml-modules/core";
import {
    hasFeatherSourceTextContext,
    createFeatherFixDetail,
    attachFeatherFixMetadata
} from "./utils.js";

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
        if (
            !range ||
            typeof range.start !== "number" ||
            typeof range.end !== "number"
        ) {
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

            if (
                typeof previousEnd === "number" &&
                typeof statementStart === "number"
            ) {
                processSegment(container, previousEnd, statementStart);
            }

            previousEnd =
                typeof statementEnd === "number"
                    ? statementEnd
                    : statementStart;
        }

        if (typeof previousEnd === "number" && typeof bounds.end === "number") {
            processSegment(container, previousEnd, bounds.end);
        }
    };

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            Core.visitChildNodes(node, visit);
            return;
        }

        if (typeof node !== "object") {
            return;
        }

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

        Core.visitChildNodes(node, visit);
    };

    visit(ast);

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
                const colonIndex = findCharacterInRange(
                    sourceText,
                    ":",
                    start,
                    end
                );

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
