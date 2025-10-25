import { getNonEmptyString, splitLines } from "../../../shared/index.js";
import { resolveProjectDisplayPath } from "./path-normalization.js";

/**
 * Format parser-originated syntax errors into the structured messages surfaced
 * by the project-index tooling. Co-locating the formatter with the rest of the
 * project-index helpers keeps the plugin reporting layer focused on the metrics
 * utilities while still allowing consumers (like the CLI) to import the
 * specialised behaviour directly from the project-index module tree.
 */
export function formatProjectIndexSyntaxError(error, sourceText, context) {
    const { filePath, projectRoot } = context ?? {};
    const lineNumber = getFiniteNumber(error.line);
    const columnNumber = getFiniteNumber(error.column);
    const displayPath = resolveProjectDisplayPath(filePath, projectRoot);

    const baseDescription = extractBaseDescription(error.message);
    const locationSuffix = buildLocationSuffix(
        displayPath,
        lineNumber,
        columnNumber
    );
    const excerpt = formatSourceExcerpt(sourceText, lineNumber, columnNumber);

    const originalMessage = error.message;
    const formattedMessage =
        `Syntax Error${locationSuffix}: ${baseDescription}` +
        (excerpt ? `\n\n${excerpt}` : "");

    error.message = formattedMessage;
    error.originalMessage = originalMessage;

    if (displayPath) {
        error.filePath = displayPath;
    }

    if (excerpt) {
        error.sourceExcerpt = excerpt;
    }

    return error;
}

function getFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function extractBaseDescription(message) {
    const normalizedMessage = getNonEmptyString(message);
    if (!normalizedMessage) {
        return "";
    }

    const match = normalizedMessage.match(/^Syntax Error[^:]*:\s*(.*)$/s);
    if (match) {
        return match[1].trim();
    }

    return normalizedMessage.trim();
}

function buildLocationSuffix(displayPath, lineNumber, columnNumber) {
    const parts = [];

    if (displayPath) {
        parts.push(displayPath);
    }

    if (lineNumber != undefined) {
        if (columnNumber == undefined) {
            parts.push(`line ${lineNumber}`);
        } else {
            parts.push(`line ${lineNumber}, column ${columnNumber}`);
        }
    }

    if (parts.length === 0) {
        return "";
    }

    return ` (${parts.join(": ")})`;
}

function formatSourceExcerpt(sourceText, lineNumber, columnNumber) {
    if (
        lineNumber == undefined ||
        lineNumber < 1 ||
        typeof sourceText !== "string"
    ) {
        return "";
    }

    const lines = splitLines(sourceText);
    const lineIndex = Math.min(lineNumber - 1, lines.length - 1);

    if (lineIndex < 0 || lineIndex >= lines.length) {
        return "";
    }

    const rawLineText = lines[lineIndex];
    const lineNumberWidth = String(lineNumber).length;
    const gutter = `${String(lineNumber).padStart(lineNumberWidth)} | `;
    const { lineText, pointerOffset } = expandTabsForDisplay(
        rawLineText,
        columnNumber
    );
    const contentLine = `${gutter}${lineText}`;

    if (columnNumber == undefined || columnNumber < 0) {
        return contentLine;
    }

    const indicatorSpacing = " ".repeat(lineNumberWidth) + " | ";
    const pointerLine = `${indicatorSpacing}${" ".repeat(pointerOffset)}^`;

    return `${contentLine}\n${pointerLine}`;
}

function expandTabsForDisplay(lineText, columnNumber, tabSize = 4) {
    if (typeof lineText !== "string" || lineText.length === 0) {
        return { lineText: "", pointerOffset: 0 };
    }

    const clampedIndex = clampColumnIndex(lineText.length, columnNumber);

    if (!lineText.includes("\t")) {
        return { lineText, pointerOffset: clampedIndex };
    }

    let expanded = "";
    let pointerOffset = 0;

    for (const [index, char] of Array.from(lineText).entries()) {
        if (index === clampedIndex) {
            pointerOffset = expanded.length;
        }

        if (char === "\t") {
            const spacesToAdd =
                tabSize - (expanded.length % tabSize) || tabSize;
            expanded += " ".repeat(spacesToAdd);
        } else {
            expanded += char;
        }
    }

    if (clampedIndex >= lineText.length) {
        pointerOffset = expanded.length;
    }

    return { lineText: expanded, pointerOffset };
}

function clampColumnIndex(length, columnNumber) {
    if (!Number.isFinite(columnNumber) || columnNumber < 0) {
        return 0;
    }

    if (!Number.isFinite(length) || length <= 0) {
        return 0;
    }

    return Math.min(Math.max(0, Math.trunc(columnNumber)), length);
}
