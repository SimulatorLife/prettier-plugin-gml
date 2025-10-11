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
import {
    getNodeStartIndex,
    getNodeEndIndex
} from "../../../shared/ast-locations.js";
import {
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "./conditional-assignment-sanitizer.js";

const { addTrailingComment } = util;

function parse(text, options) {
    let parseSource = text;
    let preprocessedFixMetadata = null;

    if (options && typeof options === "object" && options.originalText == null) {
        options.originalText = text;
    }

    if (options?.applyFeatherFixes) {
        const preprocessResult = preprocessSourceForFeatherFixes(text);

        if (preprocessResult && typeof preprocessResult.sourceText === "string") {
            parseSource = preprocessResult.sourceText;
        }

        preprocessedFixMetadata = preprocessResult?.metadata ?? null;
    }

    const sanitizedResult = sanitizeConditionalAssignments(parseSource);
    const { sourceText: sanitizedSource, indexAdjustments } = sanitizedResult;

    if (typeof sanitizedSource === "string") {
        parseSource = sanitizedSource;
    }

    const ast = GMLParser.parse(parseSource, {
        getLocations: true,
        simplifyLocations: false
    });

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
            applySanitizedIndexAdjustments(preprocessedFixMetadata, indexAdjustments);
        }
    }

    if (options?.useStringInterpolation) {
        convertStringConcatenations(ast);
    }

    if (options?.condenseLogicalExpressions) {
        condenseLogicalExpressions(ast);
    }

    preprocessFunctionArgumentDefaults(ast);

    return ast;
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
