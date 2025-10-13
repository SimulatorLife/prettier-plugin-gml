import path from "node:path";

import GMLParser from "../../../parser/gml-parser.js";
import { GameMakerSyntaxError } from "../../../parser/src/gml-syntax-error.js";

function parseProjectIndexSource(sourceText, context = {}) {
    try {
        return GMLParser.parse(sourceText, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true
        });
    } catch (error) {
        throw enrichSyntaxError(error, sourceText, context);
    }
}

export function getDefaultProjectIndexParser() {
    return parseProjectIndexSource;
}

function enrichSyntaxError(error, sourceText, context) {
    if (!(error instanceof GameMakerSyntaxError)) {
        return error;
    }

    const { filePath, projectRoot } = context ?? {};
    const lineNumber = getFiniteNumber(error.line);
    const columnNumber = getFiniteNumber(error.column);
    const displayPath = resolveDisplayPath(filePath, projectRoot);

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

function resolveDisplayPath(filePath, projectRoot) {
    if (typeof filePath !== "string" || filePath.length === 0) {
        return null;
    }

    if (!path.isAbsolute(filePath)) {
        return filePath;
    }

    if (typeof projectRoot === "string" && projectRoot.length > 0) {
        const relative = path.relative(projectRoot, filePath);
        if (
            relative &&
            !relative.startsWith("..") &&
            !path.isAbsolute(relative)
        ) {
            return relative;
        }
    }

    return filePath;
}

function extractBaseDescription(message) {
    if (typeof message !== "string" || message.length === 0) {
        return "";
    }

    const match = message.match(/^Syntax Error[^:]*:\s*(.*)$/s);
    if (match) {
        return match[1].trim();
    }

    return message.trim();
}

function buildLocationSuffix(displayPath, lineNumber, columnNumber) {
    const parts = [];

    if (displayPath) {
        parts.push(displayPath);
    }

    if (lineNumber != null) {
        if (columnNumber != null) {
            parts.push(`line ${lineNumber}, column ${columnNumber}`);
        } else {
            parts.push(`line ${lineNumber}`);
        }
    }

    if (parts.length === 0) {
        return "";
    }

    return ` (${parts.join(": ")})`;
}

function formatSourceExcerpt(sourceText, lineNumber, columnNumber) {
    if (
        lineNumber == null ||
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

    if (columnNumber == null || columnNumber < 0) {
        return contentLine;
    }

    const indicatorSpacing = " ".repeat(lineNumberWidth) + " | ";
    const pointerLine = `${indicatorSpacing}${" ".repeat(pointerOffset)}^`;

    return `${contentLine}\n${pointerLine}`;
}

function splitLines(sourceText) {
    return sourceText.split(/\r\n|\n|\r|\u2028|\u2029|\u0085/);
}

function expandTabsForDisplay(lineText, columnNumber, tabSize = 4) {
    if (typeof lineText !== "string" || lineText.length === 0) {
        return { lineText: "", pointerOffset: 0 };
    }

    if (!lineText.includes("\t")) {
        const clampedIndex = clampColumnIndex(lineText.length, columnNumber);
        return { lineText, pointerOffset: clampedIndex };
    }

    const clampedIndex = clampColumnIndex(lineText.length, columnNumber);
    let expanded = "";
    let pointerOffset = 0;

    for (let index = 0; index < lineText.length; index += 1) {
        if (index === clampedIndex) {
            pointerOffset = expanded.length;
        }

        const char = lineText[index];
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
