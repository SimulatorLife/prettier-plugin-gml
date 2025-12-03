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

const { getNodeStartIndex, getNodeEndIndex } = Core;

const { addTrailingComment } = util;

async function parseImpl(text, options) {
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
        parseSource = Parser.Utils.fixMalformedComments(parseSource);

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
            if (ast.comments && ast.comments.length > 0) {
                console.log(
                    `DEBUG: Adapter parsed ${ast.comments.length} comments.`
                );
                const sample = ast.comments[0];
                console.log(`DEBUG: First comment: ${JSON.stringify(sample)}`);
            } else {
                console.log("DEBUG: Adapter parsed 0 comments.");
            }
            if (process.env.GML_PRINTER_DEBUG) {
                try {
                    const length = Array.isArray(ast?.comments)
                        ? ast.comments.length
                        : 0;
                    console.debug(
                        `[DBG] gml-parser-adapter: parse called with getComments=true; ast.comments=${length}`
                    );
                } catch (debugError) {
                    void debugError;
                }
            }
        } catch (error) {
            if (!options?.applyFeatherFixes) {
                throw error;
            }

            const recoveredSource =
                Parser.Utils.recoverParseSourceFromMissingBrace(
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

        // Filter boilerplate comments to prevent Prettier from printing empty lines for them
        if (ast.comments && Array.isArray(ast.comments)) {
            const lineCommentOptions =
                Parser.Comments.resolveLineCommentOptions(options);
            const normalizedOptions =
                Parser.Comments.normalizeLineCommentOptions(lineCommentOptions);
            const { boilerplateFragments } = normalizedOptions;

            ast.comments = ast.comments.filter((comment) => {
                if (comment.type !== "CommentLine") {
                    return true;
                }
                const value = Core.getCommentValue(comment, { trim: true });
                for (const fragment of boilerplateFragments) {
                    if (value.includes(fragment)) {
                        return false;
                    }
                }
                return true;
            });
        }

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
            Parser.Transforms.applyIndexAdjustmentsIfPresent(
                ast,
                callIndexAdjustments,
                Parser.Transforms.applySanitizedIndexAdjustments,
                preprocessedFixMetadata
            );
        }

        Parser.Transforms.applyIndexAdjustmentsIfPresent(
            ast,
            indexAdjustments,
            Parser.Transforms.applySanitizedIndexAdjustments,
            preprocessedFixMetadata
        );

        Parser.Transforms.applyIndexAdjustmentsIfPresent(
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
        Parser.Transforms.collapseRedundantMissingCallArguments(ast);
        Parser.Transforms.enforceVariableBlockSpacing(ast, options);
        Parser.Transforms.annotateStaticFunctionOverrides(ast);

        Parser.Transforms.markCallsMissingArgumentSeparators(
            ast,
            options?.originalText ?? text
        );

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

async function parse(text, options) {
    return parseImpl(text, options);
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
