// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.

import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { util } from "prettier";
import { Parser } from "@gml-modules/parser";
import { Semantic } from "@gml-modules/semantic";
import {
    normalizeLineCommentOptions,
    resolveLineCommentOptions
} from "../comments/index.js";

const { getNodeStartIndex, getNodeEndIndex } = Core;
const { addTrailingComment } = util;

const PARSER_OPTIONS = {
    getLocations: true,
    simplifyLocations: false,
    getComments: true,
    scopeTrackerOptions: {
        enabled: true,
        getIdentifierMetadata: true,
        createScopeTracker: () => new Semantic.SemanticScopeCoordinator()
    }
} as const;

type GmlParserAdapterOptions = {
    applyFeatherFixes?: boolean;
    sanitizeMissingArgumentSeparators?: boolean;
    condenseStructAssignments?: boolean;
    useStringInterpolation?: boolean;
    condenseLogicalExpressions?: boolean;
    convertManualMathToBuiltins?: boolean;
    originalText?: string;
    __identifierCaseProjectIndexBootstrap?: unknown;
    logger?: unknown;
    variableBlockSpacingMinDeclarations?: number;
    [key: string]: unknown;
};

type ParserPreparationContext = {
    parseSource: string;
    callIndexAdjustments: Array<number> | null;
    conditionalAssignmentIndexAdjustments: Array<number> | null;
    enumIndexAdjustments: Array<number> | null;
    preprocessedFixMetadata: unknown;
};

type FeatherPreprocessCandidate = {
    metadata?: unknown;
    indexAdjustments?: Array<number> | null;
    sourceText?: unknown;
};

type FeatherPreprocessResult = {
    metadata: unknown;
    enumIndexAdjustments: Array<number> | null;
    parseSource: string;
};

type SanitizerResult = {
    sourceText?: unknown;
    indexAdjustments?: Array<number> | null;
};

function isOptionsObject(value: unknown): value is GmlParserAdapterOptions {
    return Core.isObjectLike(value);
}

async function parseImpl(
    text: string,
    options?: GmlParserAdapterOptions
): Promise<MutableGameMakerAstNode> {
    let environmentPrepared = false;
    const activeOptions = isOptionsObject(options) ? options : undefined;

    if (activeOptions) {
        Reflect.set(activeOptions, "originalText", text);
    }

    try {
        environmentPrepared =
            await prepareIdentifierCaseEnvironment(activeOptions);

        const preparation = preprocessSource(text, activeOptions);
        const ast = parseSourceWithRecovery(
            preparation.parseSource,
            activeOptions
        );

        Semantic.attachIdentifierCasePlanSnapshot(ast, activeOptions);
        filterParserComments(ast, activeOptions);

        if (!ast || typeof ast !== "object") {
            throw new Error(
                "GameMaker parser returned no AST for the provided source."
            );
        }

        applyParserTransforms(ast, preparation, activeOptions, text);
        return ast;
    } catch (error) {
        if (
            environmentPrepared ||
            activeOptions?.__identifierCaseProjectIndexBootstrap
        ) {
            Semantic.teardownIdentifierCaseEnvironment(activeOptions);
        }

        throw error;
    }
}

async function prepareIdentifierCaseEnvironment(
    options?: GmlParserAdapterOptions
): Promise<boolean> {
    if (!options) {
        return false;
    }

    await Semantic.prepareIdentifierCaseEnvironment(options);
    return true;
}

function preprocessSource(
    text: string,
    options?: GmlParserAdapterOptions
): ParserPreparationContext {
    const featherResult = preprocessFeatherFixes(
        text,
        options?.applyFeatherFixes
    );

    const commentFixedSource = String(
        Parser.Utils.fixMalformedComments(featherResult.parseSource)
    );

    const conditionalResult = Parser.Transforms.sanitizeConditionalAssignments(
        commentFixedSource
    ) as SanitizerResult;
    const conditionalSource = normalizeToString(
        conditionalResult.sourceText,
        commentFixedSource
    );

    const callSanitizedResult =
        (options?.sanitizeMissingArgumentSeparators ?? true)
            ? (Parser.Transforms.sanitizeMissingArgumentSeparators(
                  conditionalSource
              ) as SanitizerResult)
            : null;
    const callSanitizedSource = callSanitizedResult
        ? normalizeToString(callSanitizedResult.sourceText, conditionalSource)
        : conditionalSource;

    return {
        parseSource: callSanitizedSource,
        callIndexAdjustments: callSanitizedResult?.indexAdjustments ?? null,
        conditionalAssignmentIndexAdjustments:
            conditionalResult.indexAdjustments ?? null,
        enumIndexAdjustments: featherResult.enumIndexAdjustments,
        preprocessedFixMetadata: featherResult.metadata
    };
}

function preprocessFeatherFixes(
    sourceText: string,
    applyFeatherFixes?: boolean
): FeatherPreprocessResult {
    if (!applyFeatherFixes) {
        return {
            parseSource: sourceText,
            enumIndexAdjustments: null,
            metadata: null
        };
    }

    const result = Parser.Transforms.preprocessSourceForFeatherFixes(
        sourceText
    ) as FeatherPreprocessCandidate | null | undefined;

    return {
        parseSource: normalizeToString(result?.sourceText, sourceText),
        enumIndexAdjustments: result?.indexAdjustments ?? null,
        metadata: result?.metadata ?? null
    };
}

function normalizeToString(candidate: unknown, fallback: string): string {
    return typeof candidate === "string" ? candidate : fallback;
}

function parseSourceWithRecovery(
    sourceText: string,
    options?: GmlParserAdapterOptions
): MutableGameMakerAstNode {
    try {
        const ast = Parser.GMLParser.parse(
            sourceText,
            PARSER_OPTIONS
        ) as MutableGameMakerAstNode;
        logParsedCommentCount(ast);
        return ast;
    } catch (error) {
        if (!options?.applyFeatherFixes) {
            throw error;
        }

        const recoveredSource = Parser.Utils.recoverParseSourceFromMissingBrace(
            sourceText,
            error
        ) as unknown;
        if (
            typeof recoveredSource !== "string" ||
            recoveredSource === sourceText
        ) {
            throw error;
        }

        const ast = Parser.GMLParser.parse(
            recoveredSource,
            PARSER_OPTIONS
        ) as MutableGameMakerAstNode;
        logParsedCommentCount(ast);
        return ast;
    }
}

function logParsedCommentCount(ast: MutableGameMakerAstNode | null): void {
    if (!process.env.GML_PRINTER_DEBUG) {
        return;
    }

    try {
        const length = Array.isArray(ast?.comments) ? ast.comments.length : 0;
        console.debug(
            `[DBG] gml-parser-adapter: parse called with getComments=true; ast.comments=${length}`
        );
    } catch {
        // ignore
    }
}

function filterParserComments(
    ast: MutableGameMakerAstNode,
    options?: GmlParserAdapterOptions
): void {
    const comments = ast.comments;
    if (!Array.isArray(comments)) {
        return;
    }

    const lineCommentOptions = resolveLineCommentOptions(options);
    const normalizedOptions = normalizeLineCommentOptions(
        lineCommentOptions
    ) as {
        boilerplateFragments: Array<string>;
    };
    const { boilerplateFragments } = normalizedOptions;

    const filteredComments = comments.filter((comment) => {
        if (comment.type !== "CommentLine") {
            return true;
        }

        const value = String(Core.getCommentValue(comment, { trim: true }));
        for (const fragment of boilerplateFragments) {
            if (value.includes(fragment)) {
                return false;
            }
        }

        return true;
    });

    Reflect.set(ast, "comments", filteredComments);
}

function applyParserTransforms(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext,
    options: GmlParserAdapterOptions | undefined,
    originalSource: string
): void {
    applyStructuralTransforms(ast, context, options);
    applyOptionalTransforms(ast, context, options);
    applyFinalTransforms(ast, context, options, originalSource);
}

function applyStructuralTransforms(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext,
    options: GmlParserAdapterOptions | undefined
): void {
    if (options?.condenseStructAssignments ?? true) {
        Parser.Transforms.consolidateStructAssignments(ast, {
            addTrailingComment
        });
    }

    if (options?.applyFeatherFixes) {
        const featherOptions = options
            ? { ...options, removeStandaloneVertexEnd: true }
            : { removeStandaloneVertexEnd: true };

        Parser.Transforms.applyFeatherFixes(ast, {
            sourceText: context.parseSource,
            preprocessedFixMetadata: context.preprocessedFixMetadata,
            options: featherOptions
        });
    }

    applyIndexAdjustments(ast, context);
}

function applyIndexAdjustments(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext
): void {
    Parser.Transforms.applyIndexAdjustmentsIfPresent(
        ast,
        context.callIndexAdjustments,
        Parser.Transforms.applySanitizedIndexAdjustments,
        context.preprocessedFixMetadata
    );

    Parser.Transforms.applyIndexAdjustmentsIfPresent(
        ast,
        context.conditionalAssignmentIndexAdjustments,
        Parser.Transforms.applySanitizedIndexAdjustments,
        context.preprocessedFixMetadata
    );

    Parser.Transforms.applyIndexAdjustmentsIfPresent(
        ast,
        context.enumIndexAdjustments,
        Parser.Transforms.applyRemovedIndexAdjustments,
        context.preprocessedFixMetadata
    );
}

function applyOptionalTransforms(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext,
    options: GmlParserAdapterOptions | undefined
): void {
    if (options?.useStringInterpolation) {
        Parser.Transforms.convertStringConcatenations(ast);
    }

    if (options?.condenseLogicalExpressions) {
        Parser.Transforms.condenseLogicalExpressions(ast);
    }

    // Parser.Transforms.condenseScalarMultipliers(ast, {
    //     sourceText: context.parseSource,
    //     originalText: options?.originalText
    // });

    if (options?.convertManualMathToBuiltins) {
        Parser.Transforms.convertManualMathExpressions(ast, {
            sourceText: context.parseSource,
            originalText: options?.originalText,
            astRoot: ast
        });
    }
}

function applyFinalTransforms(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext,
    options: GmlParserAdapterOptions | undefined,
    originalSource: string
): void {
    Parser.Transforms.convertUndefinedGuardAssignments(ast);
    Parser.Transforms.preprocessFunctionArgumentDefaults(ast);
    Parser.Transforms.collapseRedundantMissingCallArguments(ast);
    Parser.Transforms.enforceVariableBlockSpacing(ast, {
        variableBlockSpacingMinDeclarations:
            options?.variableBlockSpacingMinDeclarations
    });
    Parser.Transforms.annotateStaticFunctionOverrides(ast);

    Parser.Transforms.markCallsMissingArgumentSeparators(
        ast,
        options?.originalText ?? originalSource
    );
}

function parse(text: string, options?: GmlParserAdapterOptions) {
    return parseImpl(text, options);
}

function locStart(node: MutableGameMakerAstNode) {
    if (!node) {
        return 0;
    }
    if (node.type === "Program") {
        return 0;
    }
    return getNodeStartIndex(node) ?? 0;
}

function locEnd(node: MutableGameMakerAstNode) {
    return getNodeEndIndex(node) ?? 0;
}

export const gmlParserAdapter = {
    parse,
    astFormat: "gml-ast",
    locStart,
    locEnd
};
