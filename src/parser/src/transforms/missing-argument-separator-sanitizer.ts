import { Core } from "@gml-modules/core";

const FALLBACK_FORBIDDEN_CALLEE = [
    "if",
    "for",
    "while",
    "switch",
    "repeat",
    "return",
    "do",
    "case",
    "default",
    "with",
    "catch"
];

const FALLBACK_FORBIDDEN_PRECEDING = ["function", "constructor"];

const identifierMetadataEntries = Core.normalizeIdentifierMetadataEntries(
    Core.getIdentifierMetadata()
);

const keywordIdentifierNames = new Set<string>();

for (const entry of identifierMetadataEntries) {
    if (entry.type === "keyword") {
        keywordIdentifierNames.add(entry.name);
    }
}

const FORBIDDEN_CALLEE_IDENTIFIERS = new Set(FALLBACK_FORBIDDEN_CALLEE);
for (const keyword of keywordIdentifierNames) {
    FORBIDDEN_CALLEE_IDENTIFIERS.add(keyword);
}

const FORBIDDEN_PRECEDING_IDENTIFIERS = new Set(FALLBACK_FORBIDDEN_PRECEDING);

interface SanitizeMissingSeparatorsResult {
    sourceText: unknown;
    indexAdjustments: Array<number> | null;
}

export function sanitizeMissingArgumentSeparators(
    sourceText: unknown
): SanitizeMissingSeparatorsResult {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    const text = sourceText;
    const length = text.length;
    const adjustmentPositions: number[] = [];
    const parts: string[] = [];
    let index = 0;
    let copyIndex = 0;
    let insertedCount = 0;
    let modified = false;

    function ensureCopied(uptoIndex: number) {
        if (copyIndex >= uptoIndex) {
            return;
        }

        parts.push(text.slice(copyIndex, uptoIndex));
        copyIndex = uptoIndex;
        modified = true;
    }

    function processCall(startIndex: number, openParenIndex: number) {
        let currentIndex = openParenIndex + 1;
        let stringQuote: string | null = null;
        let stringEscape = false;
        let inLineComment = false;
        let inBlockComment = false;
        let depth = 1;
        let callModified = false;

        while (currentIndex < length && depth > 0) {
            const character = text[currentIndex];

            if (stringQuote !== null) {
                currentIndex += 1;
                if (stringEscape) {
                    stringEscape = false;
                    continue;
                }

                if (character === "\\") {
                    stringEscape = true;
                    continue;
                }

                if (character === stringQuote) {
                    stringQuote = null;
                }

                continue;
            }

            if (inLineComment) {
                currentIndex += 1;

                if (character === "\n") {
                    inLineComment = false;
                }

                continue;
            }

            if (inBlockComment) {
                currentIndex += 1;

                if (
                    character === "*" &&
                    currentIndex < length &&
                    text[currentIndex] === "/"
                ) {
                    currentIndex += 1;
                    inBlockComment = false;
                }

                continue;
            }

            if (character === "'" || character === '"' || character === "`") {
                stringQuote = character;
                stringEscape = false;
                currentIndex += 1;
                continue;
            }

            if (character === "/" && currentIndex + 1 < length) {
                const nextCharacter = text[currentIndex + 1];

                if (nextCharacter === "/") {
                    inLineComment = true;
                    currentIndex += 2;
                    continue;
                }

                if (nextCharacter === "*") {
                    inBlockComment = true;
                    currentIndex += 2;
                    continue;
                }
            }

            if (character === "(") {
                depth += 1;
                currentIndex += 1;
                continue;
            }

            if (character === ")") {
                depth -= 1;
                currentIndex += 1;
                continue;
            }

            if (
                depth >= 1 &&
                isIdentifierBoundary(text, currentIndex - 1) &&
                (isIdentifierStartCharacter(text[currentIndex]) ||
                    text[currentIndex] === "@")
            ) {
                const nestedMatch = matchFunctionCall(text, currentIndex);

                if (nestedMatch) {
                    const nestedResult = processCall(
                        currentIndex,
                        nestedMatch.openParenIndex
                    );
                    currentIndex = nestedResult.index;
                    if (nestedResult.modified) {
                        callModified = true;
                    }
                    continue;
                }
            }

            if (depth === 1 && isNumericLiteralStart(text, currentIndex)) {
                const literal = readNumericLiteral(text, currentIndex);
                currentIndex = literal.endIndex;

                const triviaStart = currentIndex;
                const trivia = readCallSeparatorTrivia(text, currentIndex);

                currentIndex = trivia.endIndex;

                if (
                    trivia.hasContent &&
                    currentIndex < length &&
                    isNumericLiteralStart(text, currentIndex)
                ) {
                    ensureCopied(triviaStart);
                    parts.push(",");
                    adjustmentPositions.push(triviaStart + insertedCount);
                    insertedCount += 1;
                    callModified = true;
                }

                continue;
            }

            currentIndex += 1;
        }

        if (callModified) {
            ensureCopied(currentIndex);
        }

        return { index: currentIndex, modified: callModified };
    }

    while (index < length) {
        const callMatch = matchFunctionCall(text, index);

        if (callMatch) {
            const result = processCall(index, callMatch.openParenIndex);
            index = result.index;
            continue;
        }

        index += 1;
    }

    if (!modified) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    ensureCopied(length);

    return {
        sourceText: parts.join(""),
        indexAdjustments: adjustmentPositions
    };
}

function matchFunctionCall(
    sourceText: string,
    startIndex: number
): { openParenIndex: number } | null {
    if (!isIdentifierBoundary(sourceText, startIndex - 1)) {
        return null;
    }

    const length = sourceText.length;
    let index = startIndex;

    if (!isIdentifierStartCharacter(sourceText[index])) {
        if (sourceText[index] !== "@") {
            return null;
        }

        index += 1;

        if (!isIdentifierStartCharacter(sourceText[index])) {
            return null;
        }
    }

    const precedingChar = readNonTriviaCharacterBefore(sourceText, startIndex);

    if (precedingChar === "." || precedingChar === "@") {
        return null;
    }

    let lastIdentifierStart = index;
    index += 1;

    while (index < length && isIdentifierCharacter(sourceText[index])) {
        index += 1;
    }

    let lastIdentifierEnd = index;

    while (index < length) {
        const character = sourceText[index];

        if (character === "." || character === "@") {
            index += 1;

            if (
                index >= length ||
                !isIdentifierStartCharacter(sourceText[index])
            ) {
                return null;
            }

            lastIdentifierStart = index;
            index += 1;

            while (index < length && isIdentifierCharacter(sourceText[index])) {
                index += 1;
            }

            lastIdentifierEnd = index;
            continue;
        }

        if (character === "[") {
            const bracketEnd = skipBalancedSection(sourceText, index, "[", "]");

            if (bracketEnd < 0) {
                return null;
            }

            index = bracketEnd;
            continue;
        }

        break;
    }

    const calleeIdentifier = sourceText.slice(
        lastIdentifierStart,
        lastIdentifierEnd
    );

    if (FORBIDDEN_CALLEE_IDENTIFIERS.has(calleeIdentifier)) {
        return null;
    }

    const precedingIdentifier = readIdentifierBefore(sourceText, startIndex);

    if (
        precedingIdentifier &&
        FORBIDDEN_PRECEDING_IDENTIFIERS.has(precedingIdentifier)
    ) {
        return null;
    }

    const openParenIndex = skipCallTrivia(sourceText, index);

    if (openParenIndex >= length || sourceText[openParenIndex] !== "(") {
        return null;
    }

    return { openParenIndex };
}

function skipCallTrivia(sourceText: string, startIndex: number): number {
    const length = sourceText.length;
    let index = startIndex;

    while (index < length) {
        const character = sourceText[index];

        if (isWhitespaceCharacter(character)) {
            index += 1;
            continue;
        }

        if (character === "/" && index + 1 < length) {
            const nextCharacter = sourceText[index + 1];

            if (nextCharacter === "/") {
                index += 2;

                while (index < length && sourceText[index] !== "\n") {
                    index += 1;
                }

                continue;
            }

            if (nextCharacter === "*") {
                index += 2;

                while (index < length) {
                    if (
                        sourceText[index] === "*" &&
                        index + 1 < length &&
                        sourceText[index + 1] === "/"
                    ) {
                        index += 2;
                        break;
                    }

                    index += 1;
                }

                continue;
            }
        }

        break;
    }

    return index;
}

function skipBalancedSection(
    sourceText: string,
    startIndex: number,
    openChar: string,
    closeChar: string
): number {
    const length = sourceText.length;
    let index = startIndex + 1;
    let depth = 1;
    let stringQuote: string | null = null;
    let stringEscape = false;
    let inLineComment = false;
    let inBlockComment = false;

    while (index < length) {
        const character = sourceText[index];

        if (stringQuote !== null) {
            if (stringEscape) {
                stringEscape = false;
            } else if (character === "\\") {
                stringEscape = true;
            } else if (character === stringQuote) {
                stringQuote = null;
            }

            index += 1;
            continue;
        }

        if (inLineComment) {
            if (character === "\n") {
                inLineComment = false;
            }

            index += 1;
            continue;
        }

        if (inBlockComment) {
            if (
                character === "*" &&
                index + 1 < length &&
                sourceText[index + 1] === "/"
            ) {
                inBlockComment = false;
                index += 2;
                continue;
            }

            index += 1;
            continue;
        }

        if (character === "'" || character === '"' || character === "`") {
            stringQuote = character;
            stringEscape = false;
            index += 1;
            continue;
        }

        if (character === "/" && index + 1 < length) {
            const nextCharacter = sourceText[index + 1];

            if (nextCharacter === "/") {
                inLineComment = true;
                index += 2;
                continue;
            }

            if (nextCharacter === "*") {
                inBlockComment = true;
                index += 2;
                continue;
            }
        }

        if (character === openChar) {
            depth += 1;
            index += 1;
            continue;
        }

        if (character === closeChar) {
            depth -= 1;
            index += 1;

            if (depth === 0) {
                return index;
            }

            continue;
        }

        index += 1;
    }

    return -1;
}

function readIdentifierBefore(
    sourceText: string,
    index: number
): string | null {
    let current = index - 1;

    while (current >= 0) {
        const character = sourceText[current];

        if (isWhitespaceCharacter(character)) {
            current -= 1;
            continue;
        }

        if (character === "/" && current > 0) {
            const previous = sourceText[current - 1];

            if (previous === "/") {
                current -= 2;

                while (current >= 0 && sourceText[current] !== "\n") {
                    current -= 1;
                }

                continue;
            }

            if (previous === "*") {
                current -= 2;

                while (current >= 1) {
                    if (
                        sourceText[current - 1] === "/" &&
                        sourceText[current] === "*"
                    ) {
                        current -= 2;
                        break;
                    }

                    current -= 1;
                }

                continue;
            }
        }

        break;
    }

    if (current < 0 || !isIdentifierCharacter(sourceText[current])) {
        return null;
    }

    const end = current + 1;

    while (current >= 0 && isIdentifierCharacter(sourceText[current])) {
        current -= 1;
    }

    return sourceText.slice(current + 1, end);
}

function isIdentifierBoundary(sourceText: string, index: number) {
    if (index < 0 || index >= sourceText.length) {
        return true;
    }

    const character = sourceText[index];
    return !/[A-Za-z0-9_]/.test(character);
}

function isIdentifierStartCharacter(character: string | undefined) {
    return /[A-Za-z_]/.test(character ?? "");
}

function isIdentifierCharacter(character: string | undefined) {
    return /[A-Za-z0-9_]/.test(character ?? "");
}

function isWhitespaceCharacter(character: string | undefined) {
    return (
        character === " " ||
        character === "\t" ||
        character === "\n" ||
        character === "\r"
    );
}

function isNumericLiteralStart(text: string, index: number) {
    if (index >= text.length) {
        return false;
    }

    const character = text[index];
    if (character === "+" || character === "-") {
        return index + 1 < text.length && /[0-9.]/.test(text[index + 1]);
    }

    return /[0-9.]/.test(character);
}

function readNumericLiteral(text: string, startIndex: number) {
    let index = startIndex;
    const length = text.length;

    if (text[index] === "+" || text[index] === "-") {
        index += 1;
    }

    if (
        index + 1 < length &&
        text[index] === "0" &&
        (text[index + 1] === "x" || text[index + 1] === "X")
    ) {
        index += 2;

        while (index < length && /[0-9a-fA-F]/.test(text[index])) {
            index += 1;
        }

        return {
            text: text.slice(startIndex, index),
            endIndex: index
        };
    }

    if (
        index + 1 < length &&
        text[index] === "0" &&
        (text[index + 1] === "b" || text[index + 1] === "B")
    ) {
        index += 2;

        while (index < length && /[01]/.test(text[index])) {
            index += 1;
        }

        return {
            text: text.slice(startIndex, index),
            endIndex: index
        };
    }

    while (index < length && /[0-9]/.test(text[index])) {
        index += 1;
    }

    if (index < length && text[index] === ".") {
        index += 1;
        while (index < length && /[0-9]/.test(text[index])) {
            index += 1;
        }
    }

    if (index < length && (text[index] === "e" || text[index] === "E")) {
        index += 1;
        if (text[index] === "+" || text[index] === "-") {
            index += 1;
        }
        while (index < length && /[0-9]/.test(text[index])) {
            index += 1;
        }
    }

    return {
        text: text.slice(startIndex, index),
        endIndex: index
    };
}

function readCallSeparatorTrivia(text: string, startIndex: number) {
    const length = text.length;
    let index = startIndex;
    let consumed = false;

    while (index < length) {
        const character = text[index];

        if (isWhitespaceCharacter(character)) {
            index += 1;
            consumed = true;
            continue;
        }

        if (character === "/" && index + 1 < length) {
            const nextCharacter = text[index + 1];

            if (nextCharacter === "/") {
                index += 2;

                while (index < length && text[index] !== "\n") {
                    index += 1;
                }

                if (index < length) {
                    index += 1;
                }

                consumed = true;
                continue;
            }

            if (nextCharacter === "*") {
                index += 2;

                while (
                    index < length &&
                    (text[index] !== "*" ||
                        index + 1 >= length ||
                        text[index + 1] !== "/")
                ) {
                    index += 1;
                }

                if (index < length) {
                    index += 2;
                }

                consumed = true;
                continue;
            }
        }

        break;
    }

    return {
        endIndex: index,
        hasContent: consumed
    };
}

function readNonTriviaCharacterBefore(text: string, index: number) {
    let current = index - 1;

    while (current >= 0) {
        const character = text[current];

        if (isWhitespaceCharacter(character)) {
            current -= 1;
            continue;
        }

        if (character === "/" && current > 0) {
            const previous = text[current - 1];

            if (previous === "/") {
                current -= 2;

                while (current >= 0 && text[current] !== "\n") {
                    current -= 1;
                }

                continue;
            }

            if (previous === "*") {
                current -= 2;

                while (current >= 1) {
                    if (text[current - 1] === "/" && text[current] === "*") {
                        current -= 2;
                        break;
                    }

                    current -= 1;
                }

                continue;
            }
        }

        return character;
    }

    return null;
}

export function collapseRedundantMissingCallArguments(ast) {
    if (!ast || typeof ast !== "object") {
        return;
    }

    const visited = new WeakSet();

    function visit(node) {
        if (!node || typeof node !== "object" || visited.has(node)) {
            return;
        }

        visited.add(node);

        if (
            node.type === "CallExpression" &&
            Array.isArray(node.arguments) &&
            node.arguments.length > 1
        ) {
            const args = Core.toMutableArray(node.arguments) as Array<any>;
            const hasNonMissingArgument = args.some(
                (argument) => argument?.type !== "MissingOptionalArgument"
            );

            if (!hasNonMissingArgument) {
                const [firstMissingArgument] = args;
                node.arguments = firstMissingArgument
                    ? [firstMissingArgument]
                    : [];
            }
        }

        Core.visitChildNodes(node, visit);
    }

    visit(ast);
}

export function markCallsMissingArgumentSeparators(ast, originalText) {
    if (!ast || typeof ast !== "object" || typeof originalText !== "string") {
        return;
    }

    const visitedNodes = new WeakSet();

    function visit(node) {
        if (!node || typeof node !== "object") {
            return;
        }

        if (visitedNodes.has(node)) {
            return;
        }
        visitedNodes.add(node);

        Core.visitChildNodes(node, visit);

        if (shouldPreserveCallWithMissingSeparators(node, originalText)) {
            Object.defineProperty(node, "preserveOriginalCallText", {
                configurable: true,
                enumerable: false,
                writable: true,
                value: true
            });
        }
    }

    visit(ast);
}

function shouldPreserveCallWithMissingSeparators(node, originalText) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const args = Core.toMutableArray(node.arguments);

    if (
        args.some(
            (argument) =>
                argument &&
                typeof argument === "object" &&
                (argument as any).preserveOriginalCallText === true
        )
    ) {
        return true;
    }

    if (args.length < 2) {
        return false;
    }

    for (let index = 0; index < args.length - 1; index += 1) {
        const current = args[index];
        const next = args[index + 1];
        const currentEnd = Core.getNodeEndIndex(current);
        const nextStart = Core.getNodeStartIndex(next);

        if (
            currentEnd == null ||
            nextStart == null ||
            nextStart <= currentEnd
        ) {
            continue;
        }

        const between = originalText.slice(currentEnd, nextStart);
        if (between.includes(",")) {
            continue;
        }

        const previousChar = currentEnd > 0 ? originalText[currentEnd - 1] : "";
        const nextChar =
            nextStart < originalText.length ? originalText[nextStart] : "";

        if (
            !Core.isNonEmptyTrimmedString(between) &&
            isNumericBoundaryCharacter(previousChar) &&
            isNumericBoundaryCharacter(nextChar)
        ) {
            return true;
        }
    }

    return false;
}

function isNumericBoundaryCharacter(character) {
    return /[0-9.-]/.test(character ?? "");
}
