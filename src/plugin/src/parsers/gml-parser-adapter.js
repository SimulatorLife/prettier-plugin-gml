// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.
import { util } from "prettier";
import GMLParser from "gamemaker-language-parser";
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
import {
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "../../../parser/gml-parser.js";
import {
    prepareIdentifierCaseEnvironment,
    attachIdentifierCasePlanSnapshot,
    teardownIdentifierCaseEnvironment
} from "../identifier-case/environment.js";

const { addTrailingComment } = util;

async function parse(text, options) {
    let parseSource = text;
    let preprocessedFixMetadata = null;
    let environmentPrepared = false;

    if (
        options &&
        typeof options === "object" &&
        options.originalText == undefined
    ) {
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
