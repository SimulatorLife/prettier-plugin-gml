// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.
import { util } from "prettier";
import GMLParser, {
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "gamemaker-language-parser";
import { consolidateStructAssignments } from "../ast-transforms/consolidate-struct-assignments.js";
import {
    applyFeatherFixes,
    preprocessSourceForFeatherFixes
} from "../ast-transforms/apply-feather-fixes.js";
import { preprocessFunctionArgumentDefaults } from "../ast-transforms/preprocess-function-argument-defaults.js";
import { convertStringConcatenations } from "../ast-transforms/convert-string-concatenations.js";
import { condenseLogicalExpressions } from "../ast-transforms/condense-logical-expressions.js";
import { convertManualMathExpressions } from "../ast-transforms/convert-manual-math.js";
import {
    getNodeStartIndex,
    getNodeEndIndex
} from "../../../shared/ast-locations.js";
import { annotateStaticFunctionOverrides } from "../ast-transforms/annotate-static-overrides.js";
import {
    prepareIdentifierCaseEnvironment,
    attachIdentifierCasePlanSnapshot,
    teardownIdentifierCaseEnvironment
} from "../identifier-case/environment.js";
import { prepareDocCommentEnvironment } from "../comments/index.js";

const { addTrailingComment } = util;

async function parse(text, options) {
    let parseSource = text;
    let preprocessedFixMetadata = null;
    let environmentPrepared = false;

    if (options && typeof options === "object") {
        options.originalText = text;
    }

    try {
        if (options) {
            await prepareIdentifierCaseEnvironment(options);
            environmentPrepared = true;
        }

        if (options?.applyFeatherFixes) {
            const preprocessResult = preprocessSourceForFeatherFixes(text);

            if (
                preprocessResult &&
                typeof preprocessResult.sourceText === "string"
            ) {
                parseSource = preprocessResult.sourceText;
            }

            preprocessedFixMetadata = preprocessResult?.metadata ?? null;
        }

        const sanitizedResult = sanitizeConditionalAssignments(parseSource);
        const { sourceText: sanitizedSource, indexAdjustments } =
            sanitizedResult;

        if (typeof sanitizedSource === "string") {
            parseSource = sanitizedSource;
        }

        const callSanitizedResult =
            sanitizeMissingArgumentSeparators(parseSource);
        const {
            sourceText: callSanitizedSource,
            indexAdjustments: callIndexAdjustments
        } = callSanitizedResult;

        if (typeof callSanitizedSource === "string") {
            parseSource = callSanitizedSource;
        }

        let ast;

        try {
            ast = GMLParser.parse(parseSource, {
                getLocations: true,
                simplifyLocations: false
            });
        } catch (error) {
            if (!options?.applyFeatherFixes) {
                throw error;
            }

            const recoveredSource = recoverParseSourceFromMissingBrace(
                parseSource,
                error
            );

            const hasUsableRecovery =
                typeof recoveredSource === "string" &&
                recoveredSource !== parseSource;
            if (!hasUsableRecovery) {
                throw error;
            }

            parseSource = recoveredSource;
            ast = GMLParser.parse(parseSource, {
                getLocations: true,
                simplifyLocations: false
            });
        }

        attachIdentifierCasePlanSnapshot(ast, options);

        if (!ast || typeof ast !== "object") {
            throw new Error(
                "GameMaker parser returned no AST for the provided source."
            );
        }

        prepareDocCommentEnvironment(ast);

        if (options?.condenseStructAssignments ?? true) {
            consolidateStructAssignments(ast, { addTrailingComment });
        }

        if (options?.applyFeatherFixes) {
            applyFeatherFixes(ast, {
                sourceText: parseSource,
                preprocessedFixMetadata,
                options
            });
        }

        if (callIndexAdjustments && callIndexAdjustments.length > 0) {
            applySanitizedIndexAdjustments(ast, callIndexAdjustments);
            if (preprocessedFixMetadata) {
                applySanitizedIndexAdjustments(
                    preprocessedFixMetadata,
                    callIndexAdjustments
                );
            }
        }

        if (indexAdjustments && indexAdjustments.length > 0) {
            applySanitizedIndexAdjustments(ast, indexAdjustments);
            if (preprocessedFixMetadata) {
                applySanitizedIndexAdjustments(
                    preprocessedFixMetadata,
                    indexAdjustments
                );
            }
        }

        if (options?.useStringInterpolation) {
            convertStringConcatenations(ast);
        }

        if (options?.condenseLogicalExpressions) {
            condenseLogicalExpressions(ast);
        }

        if (options?.convertManualMathToBuiltins) {
            convertManualMathExpressions(ast, undefined, {
                sourceText: parseSource,
                originalText: options?.originalText
            });
        }

        preprocessFunctionArgumentDefaults(ast);
        annotateStaticFunctionOverrides(ast);

        markCallsMissingArgumentSeparators(ast, options?.originalText ?? text);

        return ast;
    } catch (error) {
        if (environmentPrepared) {
            teardownIdentifierCaseEnvironment(options);
        }
        throw error;
    }
}

function locStart(node) {
    return getNodeStartIndex(node) ?? 0;
}

function locEnd(node) {
    return getNodeEndIndex(node) ?? 0;
}

export const gmlParserAdapter = {
    parse,
    astFormat: "gml-ast",
    locStart,
    locEnd
};

function sanitizeMissingArgumentSeparators(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return {
            sourceText,
            indexAdjustments: null
        };
    }

    const length = sourceText.length;
    const adjustmentPositions = [];
    const parts = [];
    let index = 0;
    let copyIndex = 0;
    let insertedCount = 0;
    let modified = false;

    function ensureCopied(uptoIndex) {
        if (copyIndex >= uptoIndex) {
            return;
        }

        parts.push(sourceText.slice(copyIndex, uptoIndex));
        copyIndex = uptoIndex;
        modified = true;
    }

    function processCall(startIndex, openParenIndex) {
        let callModified = false;
        let depth = 1;
        let stringQuote = null;
        let stringEscape = false;
        let inLineComment = false;
        let inBlockComment = false;
        let currentIndex = openParenIndex + 1;

        while (currentIndex < length && depth > 0) {
            const character = sourceText[currentIndex];

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
                    sourceText[currentIndex] === "/"
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
                const nextCharacter = sourceText[currentIndex + 1];

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
                isIdentifierBoundary(sourceText, currentIndex - 1) &&
                (isIdentifierStartCharacter(sourceText[currentIndex]) ||
                    sourceText[currentIndex] === "@")
            ) {
                const nestedMatch = matchFunctionCall(sourceText, currentIndex);

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

            if (
                depth === 1 &&
                isNumericLiteralStart(sourceText, currentIndex)
            ) {
                const literal = readNumericLiteral(sourceText, currentIndex);
                currentIndex = literal.endIndex;

                const triviaStart = currentIndex;
                const trivia = readCallSeparatorTrivia(
                    sourceText,
                    currentIndex
                );

                currentIndex = trivia.endIndex;

                if (
                    trivia.hasContent &&
                    currentIndex < length &&
                    isNumericLiteralStart(sourceText, currentIndex)
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
        const callMatch = matchFunctionCall(sourceText, index);

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

const FORBIDDEN_CALLEE_IDENTIFIERS = new Set([
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
]);

const FORBIDDEN_PRECEDING_IDENTIFIERS = new Set(["function", "constructor"]);

function matchFunctionCall(sourceText, startIndex) {
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

function skipCallTrivia(sourceText, startIndex) {
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

function skipBalancedSection(sourceText, startIndex, openChar, closeChar) {
    const length = sourceText.length;
    let index = startIndex + 1;
    let depth = 1;
    let stringQuote = null;
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

function readIdentifierBefore(sourceText, index) {
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

    let end = current + 1;

    while (current >= 0 && isIdentifierCharacter(sourceText[current])) {
        current -= 1;
    }

    return sourceText.slice(current + 1, end);
}

function isIdentifierBoundary(sourceText, index) {
    if (index < 0 || index >= sourceText.length) {
        return true;
    }

    const character = sourceText[index];
    return !/[A-Za-z0-9_]/.test(character);
}

function isIdentifierStartCharacter(character) {
    return /[A-Za-z_]/.test(character ?? "");
}

function isIdentifierCharacter(character) {
    return /[A-Za-z0-9_]/.test(character ?? "");
}

function isWhitespaceCharacter(character) {
    return (
        character === " " ||
        character === "\t" ||
        character === "\n" ||
        character === "\r"
    );
}

function isNumericLiteralStart(text, index) {
    if (index >= text.length) {
        return false;
    }

    const character = text[index];
    if (character === "+" || character === "-") {
        return index + 1 < text.length && /[0-9.]/.test(text[index + 1]);
    }

    return /[0-9.]/.test(character);
}

function readNumericLiteral(text, startIndex) {
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

function readCallSeparatorTrivia(text, startIndex) {
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
                    !(
                        text[index] === "*" &&
                        index + 1 < length &&
                        text[index + 1] === "/"
                    )
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

function readNonTriviaCharacterBefore(sourceText, index) {
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

        return character;
    }

    return null;
}

function markCallsMissingArgumentSeparators(ast, originalText) {
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

        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }

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

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (
        args.some(
            (argument) =>
                argument &&
                typeof argument === "object" &&
                argument.preserveOriginalCallText === true
        )
    ) {
        return true;
    }

    const callee = node.object;
    if (args.length < 2) {
        return false;
    }

    for (let index = 0; index < args.length - 1; index += 1) {
        const current = args[index];
        const next = args[index + 1];
        const currentEnd = getNodeEndIndex(current);
        const nextStart = getNodeStartIndex(next);

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
            between.trim().length === 0 &&
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

function recoverParseSourceFromMissingBrace(sourceText, error) {
    if (!isMissingClosingBraceError(error)) {
        return null;
    }

    const appended = appendMissingClosingBraces(sourceText);

    return appended === sourceText ? null : appended;
}

function isMissingClosingBraceError(error) {
    if (!error) {
        return false;
    }

    const message =
        typeof error.message === "string"
            ? error.message
            : typeof error === "string"
              ? error
              : String(error ?? "");

    return message.toLowerCase().includes("missing associated closing brace");
}

function appendMissingClosingBraces(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return sourceText;
    }

    const missingBraceCount = countUnclosedBraces(sourceText);

    if (missingBraceCount <= 0) {
        return sourceText;
    }

    let normalized = sourceText;

    if (!normalized.endsWith("\n")) {
        normalized += "\n";
    }

    const closingLines = new Array(missingBraceCount).fill("}").join("\n");

    return `${normalized}${closingLines}`;
}

function countUnclosedBraces(sourceText) {
    let depth = 0;
    let inSingleLineComment = false;
    let inBlockComment = false;
    let stringDelimiter = null;
    let isEscaped = false;

    for (let index = 0; index < sourceText.length; index += 1) {
        const char = sourceText[index];
        const nextChar = sourceText[index + 1];

        if (stringDelimiter) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (char === "\\") {
                isEscaped = true;
                continue;
            }

            if (char === stringDelimiter) {
                stringDelimiter = null;
            }

            continue;
        }

        if (inSingleLineComment) {
            if (char === "\n") {
                inSingleLineComment = false;
            }

            continue;
        }

        if (inBlockComment) {
            if (char === "*" && nextChar === "/") {
                inBlockComment = false;
                index += 1;
            }

            continue;
        }

        if (char === "/" && nextChar === "/") {
            inSingleLineComment = true;
            index += 1;
            continue;
        }

        if (char === "/" && nextChar === "*") {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (char === "'" || char === '"') {
            stringDelimiter = char;
            continue;
        }

        if (char === "{") {
            depth += 1;
            continue;
        }

        if (char === "}" && depth > 0) {
            depth -= 1;
        }
    }

    return depth;
}
