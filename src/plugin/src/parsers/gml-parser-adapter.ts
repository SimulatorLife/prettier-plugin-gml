// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.

import { Core } from "@gml-modules/core";
import { util } from "prettier";
import { Parser } from "@gml-modules/parser";
import { Semantic } from "@gml-modules/semantic";

// Prefer calling Core's doc comment services directly to avoid adapter
// layers or re-export shims. This keeps the runtime contract stable and
// avoids added indirection during printing and parsing.

const {
    getNodeStartIndex,
    getNodeEndIndex,
    toMutableArray,
    visitChildNodes,
    isNonEmptyTrimmedString
} = Core;

const { addTrailingComment } = util;

function applyIndexAdjustmentsIfPresent(
    target,
    adjustments,
    applyAdjustments,
    metadata
) {
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
        return;
    }

    applyAdjustments(target, adjustments);

    if (metadata !== null) {
        applyAdjustments(metadata, adjustments);
    }
}

async function parse(text, options) {
    let parseSource = text;
    let preprocessedFixMetadata = null;
    let enumIndexAdjustments = null;
    let environmentPrepared = false;

    if (options && typeof options === "object") {
        options.originalText = text;
    }

    // Enable scope tracking so the printer can detect and prefix global identifiers.
    const parserOptions = {
        getLocations: true,
        simplifyLocations: false,
        getComments: true,
        scopeTrackerOptions: {
            enabled: true,
            getIdentifierMetadata: true,
            createScopeTracker: () => new Semantic.SemanticScopeCoordinator()
        }
    };

    try {
        if (options) {
            await Semantic.prepareIdentifierCaseEnvironment(options);
            environmentPrepared = true;
        }

        if (options?.applyFeatherFixes) {
            // TODO: 'applyFeatherFixes' should NOT be a separate option but instead one of the transforms
            const preprocessResult =
                Parser.Transforms.preprocessSourceForFeatherFixes(text);

            if (
                preprocessResult &&
                typeof preprocessResult.sourceText === "string"
            ) {
                parseSource = preprocessResult.sourceText;
            }

            preprocessedFixMetadata = preprocessResult?.metadata ?? null;
            enumIndexAdjustments = preprocessResult?.indexAdjustments ?? null;
        }

        // Fix malformed comments that start with single / followed by space
        // These should be converted to proper // comments to avoid parsing errors
        parseSource = fixMalformedComments(parseSource);

        const sanitizedResult =
            Parser.Transforms.sanitizeConditionalAssignments(parseSource);
        const { sourceText: sanitizedSource, indexAdjustments } =
            sanitizedResult;

        if (typeof sanitizedSource === "string") {
            parseSource = sanitizedSource;
        }

        const enableMissingArgumentSeparatorSanitizer =
            options?.sanitizeMissingArgumentSeparators ?? true;
        let callIndexAdjustments = null;

        if (enableMissingArgumentSeparatorSanitizer) {
            const callSanitizedResult =
                Parser.Transforms.sanitizeMissingArgumentSeparators(
                    parseSource
                );
            const { sourceText: callSanitizedSource, indexAdjustments } =
                callSanitizedResult;

            if (typeof callSanitizedSource === "string") {
                parseSource = callSanitizedSource;
            }

            callIndexAdjustments = indexAdjustments ?? null;
        }

        let ast;

        try {
            ast = Parser.GMLParser.parse(parseSource, parserOptions);
            if (process.env.GML_PRINTER_DEBUG) {
                try {
                    const length = Array.isArray(ast?.comments)
                        ? ast.comments.length
                        : 0;
                    console.debug(
                        `[DBG] gml-parser-adapter: parse called with getComments=true; ast.comments=${length}`
                    );
                } catch {}
            }
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
            ast = Parser.GMLParser.parse(parseSource, parserOptions);
        }

        Semantic.attachIdentifierCasePlanSnapshot(ast, options);

        if (!ast || typeof ast !== "object") {
            throw new Error(
                "GameMaker parser returned no AST for the provided source."
            );
        }

        if (options?.condenseStructAssignments ?? true) {
            Parser.Transforms.consolidateStructAssignments(ast, {
                addTrailingComment
            });
        }

        if (options?.applyFeatherFixes) {
            Parser.Transforms.applyFeatherFixes(ast, {
                sourceText: parseSource,
                preprocessedFixMetadata,
                options: {
                    ...options,
                    removeStandaloneVertexEnd: true
                }
            });
        }

        if (enableMissingArgumentSeparatorSanitizer) {
            applyIndexAdjustmentsIfPresent(
                ast,
                callIndexAdjustments,
                Parser.Transforms.applySanitizedIndexAdjustments,
                preprocessedFixMetadata
            );
        }

        applyIndexAdjustmentsIfPresent(
            ast,
            indexAdjustments,
            Parser.Transforms.applySanitizedIndexAdjustments,
            preprocessedFixMetadata
        );

        applyIndexAdjustmentsIfPresent(
            ast,
            enumIndexAdjustments,
            Parser.Transforms.applyRemovedIndexAdjustments,
            preprocessedFixMetadata
        );

        if (options?.useStringInterpolation) {
            Parser.Transforms.convertStringConcatenations(ast);
        }

        if (options?.condenseLogicalExpressions) {
            Parser.Transforms.condenseLogicalExpressions(ast);
        }

        Parser.Transforms.condenseScalarMultipliers(ast, {
            sourceText: parseSource,
            originalText: options?.originalText
        });

        if (options?.convertManualMathToBuiltins) {
            Parser.Transforms.convertManualMathExpressions(ast, {
                sourceText: parseSource,
                originalText: options?.originalText
            });
        }

        Parser.Transforms.convertUndefinedGuardAssignments(ast);
        Parser.Transforms.preprocessFunctionArgumentDefaults(ast);
        collapseRedundantMissingCallArguments(ast);
        Parser.Transforms.enforceVariableBlockSpacing(ast, options);
        Parser.Transforms.annotateStaticFunctionOverrides(ast);

        markCallsMissingArgumentSeparators(ast, options?.originalText ?? text);

        return ast;
    } catch (error) {
        if (
            environmentPrepared ||
            options?.__identifierCaseProjectIndexBootstrap
        ) {
            Semantic.teardownIdentifierCaseEnvironment(options);
        }
        throw error;
    }
}

function parseSync(text, options) {
    if (options?.__identifierCasePlanGeneratedInternally === true) {
        try {
            return Parser.GMLParser.parse(text, {
                getLocations: true,
                simplifyLocations: false,
                getComments: true
            });
        } catch (error) {
            Semantic.teardownIdentifierCaseEnvironment(options);
            throw error;
        }
    }

    return parse(text, options);
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

function collapseRedundantMissingCallArguments(ast) {
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
            const args = toMutableArray(node.arguments);
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

        visitChildNodes(node, visit);
    }

    visit(ast);
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

        visitChildNodes(node, visit);

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

    const args = toMutableArray(node.arguments);

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
            !isNonEmptyTrimmedString(between) &&
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

/**
 * Fix malformed comments that start with a single forward slash followed by space.
 * These are common in real-world GML code where users write "/ @something" instead of "// @something".
 * This pre-processing step converts them to proper comments to avoid parsing errors.
 * We're specifically targeting doc-comment-like patterns that start with @.
 *
 * @param {string} sourceText - The source text to fix
 * @returns {string} - The fixed source text
 */
function fixMalformedComments(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return sourceText;
    }

    // Replace lines that start with "/ " followed by @ and content with "// "
    // This handles cases like "/ @function something" -> "// @function something"
    // but avoids changing expressions like "x / 2"
    return sourceText.replaceAll(/^(\s*)\/\s+(@.+)$/gm, "$1// $2");
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
