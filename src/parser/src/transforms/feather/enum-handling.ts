import { Core } from "@gml-modules/core";

function sanitizeEnumBodyInitializerStrings(
    body: string,
    bodyStartIndex: number,
    totalRemoved: number
) {
    if (!Core.isNonEmptyString(body)) {
        return { sanitizedBody: body, adjustments: [], removedCount: 0 };
    }

    let bodyRemoved = 0;
    const adjustments: Array<{ index: number; delta: number }> = [];

    const sanitizedBody = body.replaceAll(
        /(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(["'])([^"']*)(\2)/g,
        (fullMatch, prefix, _quote, rawValue, _closingQuote, offset) => {
            const normalizedValue = rawValue.trim();
            if (!isIntegerLiteralString(normalizedValue)) {
                return fullMatch;
            }

            const replacement = `${prefix}${normalizedValue}`;
            const removedCount = fullMatch.length - replacement.length;

            if (removedCount > 0) {
                const sanitizedIndex =
                    bodyStartIndex +
                    offset +
                    replacement.length -
                    (totalRemoved + bodyRemoved);

                adjustments.push({
                    index: sanitizedIndex,
                    delta: removedCount
                });
                bodyRemoved += removedCount;
            }

            return replacement;
        }
    );

    return { sanitizedBody, adjustments, removedCount: bodyRemoved };
}

function skipLineComment(sourceText: string, startIndex: number) {
    const length = sourceText.length;

    for (let index = startIndex; index < length; index += 1) {
        const char = sourceText[index];
        if (char === "\n" || char === "\r") {
            return index - 1;
        }
    }

    return length - 1;
}

function skipBlockComment(sourceText: string, startIndex: number) {
    const length = sourceText.length;

    for (let index = startIndex; index < length - 1; index += 1) {
        if (sourceText[index] === "*" && sourceText[index + 1] === "/") {
            return index + 1;
        }
    }

    return length - 1;
}

function skipStringLiteral(sourceText: string, startIndex: number) {
    const length = sourceText.length;
    const quote = sourceText[startIndex];
    let index = startIndex + 1;

    while (index < length) {
        const char = sourceText[index];
        if (char === "\\") {
            index += 2;
            continue;
        }

        if (char === quote) {
            return index;
        }

        index += 1;
    }

    return length - 1;
}

function skipToken(sourceText: string, index: number, length: number) {
    const char = sourceText[index];

    if (char === '"' || char === "'") {
        return skipStringLiteral(sourceText, index);
    }

    if (
        char === "@" &&
        index + 1 < length &&
        (sourceText[index + 1] === '"' || sourceText[index + 1] === "'")
    ) {
        return skipStringLiteral(sourceText, index + 1);
    }

    if (char === "/" && index + 1 < length) {
        const nextChar = sourceText[index + 1];
        if (nextChar === "/") {
            return skipLineComment(sourceText, index + 2);
        }
        if (nextChar === "*") {
            return skipBlockComment(sourceText, index + 2);
        }
    }

    return index;
}

function findNextOpenBrace(sourceText: string, startIndex: number) {
    const length = sourceText.length;

    for (let index = startIndex; index < length; index += 1) {
        const skippedIndex = skipToken(sourceText, index, length);
        if (skippedIndex !== index) {
            index = skippedIndex;
            continue;
        }

        if (sourceText[index] === "{") {
            return index;
        }
    }

    return -1;
}

function findMatchingClosingBrace(sourceText: string, openBraceIndex: number) {
    const length = sourceText.length;
    let depth = 0;

    for (let index = openBraceIndex; index < length; index += 1) {
        const skippedIndex = skipToken(sourceText, index, length);
        if (skippedIndex !== index) {
            index = skippedIndex;
            continue;
        }

        const char = sourceText[index];
        if (char === "{") {
            depth += 1;
            continue;
        }

        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

function sanitizeEnumInitializerStrings(sourceText: string) {
    if (!Core.isNonEmptyString(sourceText)) {
        return { sourceText, adjustments: null };
    }

    const enumPattern = /\benum\b/g;
    let lastIndex = 0;
    let result = "";
    const adjustments: Array<{ index: number; delta: number }> = [];
    let totalRemoved = 0;

    while (enumPattern.exec(sourceText) !== null) {
        const openBraceIndex = findNextOpenBrace(
            sourceText,
            enumPattern.lastIndex
        );
        if (openBraceIndex === -1) {
            break;
        }

        const closeBraceIndex = findMatchingClosingBrace(
            sourceText,
            openBraceIndex
        );

        if (closeBraceIndex === -1) {
            break;
        }

        result += sourceText.slice(lastIndex, openBraceIndex + 1);

        const bodyStartIndex = openBraceIndex + 1;
        const body = sourceText.slice(bodyStartIndex, closeBraceIndex);
        const {
            sanitizedBody,
            adjustments: bodyAdjustments,
            removedCount: bodyRemoved
        } = sanitizeEnumBodyInitializerStrings(
            body,
            bodyStartIndex,
            totalRemoved
        );

        if (bodyAdjustments.length > 0) {
            adjustments.push(...bodyAdjustments);
            totalRemoved += bodyRemoved;
        }

        result += sanitizedBody;
        lastIndex = closeBraceIndex;
        enumPattern.lastIndex = closeBraceIndex;
    }

    if (lastIndex === 0) {
        return { sourceText, adjustments: null };
    }

    result += sourceText.slice(lastIndex);
    return {
        sourceText: result,
        adjustments: adjustments.length > 0 ? adjustments : null
    };
}

function normalizeRemovalAdjustments(adjustments: unknown) {
    if (!Array.isArray(adjustments)) {
        return [] as Array<{ index: number; delta: number }>;
    }

    return adjustments
        .filter((entry) => {
            if (!entry || typeof entry !== "object") {
                return false;
            }

            const { index, delta } = entry as {
                index?: number;
                delta?: number;
            };
            return (
                Number.isFinite(index) &&
                Number.isFinite(delta) &&
                typeof delta === "number" &&
                delta > 0
            );
        })
        .sort((a, b) => a.index - b.index);
}

function mapIndexForRemoval(
    index: number,
    adjustments: Array<{ index: number; delta: number }>
) {
    if (!Number.isFinite(index)) {
        return index;
    }

    let adjusted = index;

    for (const { index: cutoff, delta } of adjustments) {
        if (index >= cutoff) {
            adjusted += delta;
        } else {
            break;
        }
    }

    return adjusted;
}

function adjustLocationForRemoval(
    node: Record<string, unknown>,
    property: string,
    adjustments: Array<{ index: number; delta: number }>
) {
    if (!Object.hasOwn(node, property)) {
        return;
    }

    const location = (node as any)[property];

    if (typeof location === "number") {
        (node as any)[property] = mapIndexForRemoval(location, adjustments);
        return;
    }

    if (
        location &&
        typeof location === "object" &&
        typeof location.index === "number"
    ) {
        location.index = mapIndexForRemoval(location.index, adjustments);
    }
}

export function applyRemovedIndexAdjustments(
    target: unknown,
    adjustments: unknown
) {
    const normalized = normalizeRemovalAdjustments(adjustments);
    if (normalized.length === 0) {
        return;
    }

    const stack = [target];
    const seen = new WeakSet();

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object" || seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (Array.isArray(current)) {
            for (const value of current) {
                stack.push(value);
            }
            continue;
        }

        adjustLocationForRemoval(
            current as Record<string, unknown>,
            "start",
            normalized
        );
        adjustLocationForRemoval(
            current as Record<string, unknown>,
            "end",
            normalized
        );

        for (const value of Object.values(current)) {
            stack.push(value);
        }
    }
}

export function preprocessSourceForFeatherFixes(sourceText: string) {
    if (!Core.isNonEmptyString(sourceText)) {
        return {
            sourceText,
            metadata: null
        };
    }

    const gm1100Metadata: Array<unknown> = [];
    const gm1016Metadata: Array<unknown> = [];
    const sanitizedParts: string[] = [];
    const newlinePattern = /\r?\n/g;
    let lastIndex = 0;
    let lineNumber = 1;
    let pendingGM1100Context: null | {
        identifier: string;
        indentation: string;
    } = null;

    const processLine = (line: string) => {
        const indentationMatch = line.match(/^\s*/);
        const indentation = indentationMatch ? indentationMatch[0] : "";
        const trimmed = Core.toTrimmedString(line);

        if (trimmed.length === 0) {
            return { line, context: pendingGM1100Context };
        }

        const booleanLiteralMatch = line.match(
            /^(\s*)(true|false)\s*(?:;\s*)?$/
        );

        if (booleanLiteralMatch) {
            const leadingWhitespace = booleanLiteralMatch[1] ?? "";
            const sanitizedRemainder = " ".repeat(
                Math.max(0, line.length - leadingWhitespace.length)
            );
            const sanitizedLine = `${leadingWhitespace}${sanitizedRemainder}`;
            const trimmedRightLength = line.replace(/\s+$/, "").length;
            const startColumn = leadingWhitespace.length;
            const endColumn = Math.max(startColumn, trimmedRightLength - 1);
            const lineStartIndex = lastIndex;

            gm1016Metadata.push({
                start: {
                    line: lineNumber,
                    column: startColumn,
                    index: lineStartIndex + startColumn
                },
                end: {
                    column: endColumn,
                    index: lineStartIndex + endColumn
                }
            });

            return { line: sanitizedLine, context: null };
        }

        const varMatch = line.match(/^\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\b/);

        if (varMatch) {
            const identifier = varMatch[1];
            const remainder = line.slice(varMatch[0].length);
            const trimmedRemainder = remainder.replace(/^\s*/, "");

            if (trimmedRemainder.startsWith("*")) {
                const leadingWhitespaceLength =
                    remainder.length - trimmedRemainder.length;
                const leadingWhitespace =
                    leadingWhitespaceLength > 0
                        ? remainder.slice(0, leadingWhitespaceLength)
                        : "";
                const sanitizedLine = [
                    line.slice(0, varMatch[0].length),
                    leadingWhitespace,
                    "=",
                    trimmedRemainder.slice(1)
                ].join("");

                gm1100Metadata.push({
                    type: "declaration",
                    line: lineNumber,
                    identifier
                });

                return {
                    line: sanitizedLine,
                    context: {
                        identifier,
                        indentation
                    }
                };
            }
        }

        if (trimmed.startsWith("=") && pendingGM1100Context?.identifier) {
            const rawRemainder = line.slice(indentation.length);
            const identifier = pendingGM1100Context.identifier;

            gm1100Metadata.push({
                type: "assignment",
                line: lineNumber,
                identifier
            });

            const sanitizedLine = `${indentation}${" ".repeat(
                Math.max(0, rawRemainder.length)
            )}`;

            return { line: sanitizedLine, context: null };
        }

        if (trimmed.startsWith("/") || trimmed.startsWith("*")) {
            return { line, context: pendingGM1100Context };
        }

        return { line, context: null };
    };

    let match: RegExpExecArray | null;

    while ((match = newlinePattern.exec(sourceText)) !== null) {
        const lineEnd = match.index;
        const line = sourceText.slice(lastIndex, lineEnd);
        const newline = match[0];
        const { line: sanitizedLine, context } = processLine(line);

        sanitizedParts.push(sanitizedLine, newline);
        pendingGM1100Context = context;
        lastIndex = match.index + newline.length;
        lineNumber += 1;
    }

    const finalLine = sourceText.slice(lastIndex);
    if (
        finalLine.length > 0 ||
        sourceText.endsWith("\n") ||
        sourceText.endsWith("\r")
    ) {
        const { line: sanitizedLine, context } = processLine(finalLine);
        sanitizedParts.push(sanitizedLine);
        pendingGM1100Context = context;
    }

    const sanitizedSourceText = sanitizedParts.join("");
    const enumSanitizedResult =
        sanitizeEnumInitializerStrings(sanitizedSourceText);
    const enumSanitizedSourceText = enumSanitizedResult.sourceText;
    const enumIndexAdjustments = enumSanitizedResult.adjustments;
    const metadata: Record<string, unknown> = {};

    if (gm1100Metadata.length > 0) {
        metadata.GM1100 = gm1100Metadata;
    }

    if (gm1016Metadata.length > 0) {
        metadata.GM1016 = gm1016Metadata;
    }

    const hasMetadata = Object.keys(metadata).length > 0;
    const sourceChanged = enumSanitizedSourceText !== sourceText;
    const hasIndexAdjustments = Core.isNonEmptyArray(enumIndexAdjustments);

    if (!hasMetadata && !sourceChanged) {
        return {
            sourceText,
            metadata: null,
            indexAdjustments: null
        };
    }

    return {
        sourceText: sourceChanged ? enumSanitizedSourceText : sourceText,
        metadata: hasMetadata ? metadata : null,
        indexAdjustments: hasIndexAdjustments ? enumIndexAdjustments : null
    };
}

function isIntegerLiteralString(candidate: unknown) {
    if (typeof candidate !== "string" || candidate.length === 0) {
        return false;
    }

    if (/^[+-]?\d+$/.test(candidate)) {
        return true;
    }

    if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(candidate)) {
        return true;
    }

    if (/^[+-]?0[bB][01]+$/.test(candidate)) {
        return true;
    }

    return false;
}

export {
    findMatchingClosingBrace,
    findNextOpenBrace,
    sanitizeEnumBodyInitializerStrings,
    sanitizeEnumInitializerStrings
};
