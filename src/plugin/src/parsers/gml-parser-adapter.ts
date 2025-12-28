// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.

import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { util } from "prettier";
import { Parser, type ScopeTracker } from "@gml-modules/parser";
import * as Transforms from "../transforms/index.js";
import { Semantic } from "@gml-modules/semantic";

const { getNodeStartIndex, getNodeEndIndex } = Core;
const { addTrailingComment } = util;

/**
 * Factory function type for creating scope tracker instances.
 * Abstracts the concrete implementation from the parser adapter.
 */
export type ScopeTrackerFactory = () => ScopeTracker | null;

/**
 * Configuration for the GML parser adapter that supports dependency injection.
 */
export type GmlParserAdapterConfig = {
    readonly scopeTrackerFactory: ScopeTrackerFactory;
};

/**
 * Creates parser options with the injected scope tracker factory.
 */
function createParserOptions(config: GmlParserAdapterConfig) {
    return {
        getLocations: true,
        simplifyLocations: false,
        getComments: true,
        scopeTrackerOptions: {
            enabled: true,
            getIdentifierMetadata: true,
            createScopeTracker: config.scopeTrackerFactory
        }
    } as const;
}

export type GmlParserAdapterOptions = {
    applyFeatherFixes?: boolean;
    sanitizeMissingArgumentSeparators?: boolean;
    condenseStructAssignments?: boolean;
    useStringInterpolation?: boolean;
    condenseLogicalExpressions?: boolean;
    optimizeMathExpressions?: boolean;
    stripComments?: boolean;

    // DESIGN SMELL: These fields are not true parser options; they're runtime state
    // or context passed through the options bag for convenience. This violates separation
    // of concerns and makes the interface unclear.
    //
    // - originalText: Stores the unmodified source before preprocessing. Used by the
    //   printer to recover original text for certain nodes. Should be passed via a
    //   separate context object or stored in the AST metadata, not in parser options.
    //
    // - __identifierCaseProjectIndexBootstrap: Initialization data for the identifier-case
    //   analysis subsystem. Should be managed by the Semantic module and passed through
    //   a dedicated bootstrap context, not smuggled through parser options.
    //
    // - [key: string]: unknown: Catch-all index signature that allows arbitrary properties.
    //   This defeats type safety and makes it impossible to catch typos or invalid options
    //   at compile time. Remove this and define explicit optional fields for any legitimate
    //   options that need to be added.
    //
    // LONG-TERM FIX: Refactor the option-passing architecture to separate:
    //   1. Pure parser options (flags that control parsing behavior)
    //   2. Preprocessing context (source transformations, index adjustments)
    //   3. Runtime state (original text, semantic bootstrap data)
    //   4. Printer context (formatting preferences, semantic rename maps)
    //
    // Each of these should have its own typed interface and be passed through the
    // appropriate channels instead of being conflated in a single options object.
    originalText?: string;
    __identifierCaseProjectIndexBootstrap?: unknown;
    normalizeDocComments?: boolean;
    [key: string]: unknown;
};

type ParserPreparationContext = {
    parseSource: string;
    callIndexAdjustments: Array<number> | null;
    conditionalAssignmentIndexAdjustments: Array<number> | null;
    enumIndexAdjustments: Array<number> | null;
    preprocessedFixMetadata: unknown;
    commentFixMapper?: (index: number) => number;
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
    parserOptions: ReturnType<typeof createParserOptions>,
    options?: GmlParserAdapterOptions
): Promise<MutableGameMakerAstNode> {
    let environmentPrepared = false;
    const activeOptions = isOptionsObject(options) ? options : undefined;

    if (process.env.GML_PRINTER_DEBUG) {
        console.debug(
            "[DEBUG] parseImpl options:",
            JSON.stringify(activeOptions, null, 2)
        );
    }

    if (activeOptions) {
        Reflect.set(activeOptions, "originalText", text);
    }

    try {
        environmentPrepared =
            await prepareIdentifierCaseEnvironment(activeOptions);

        const preparation = preprocessSource(text, activeOptions);
        if (process.env.GML_PRINTER_DEBUG) {
            console.debug(
                "[DEBUG] Preprocessed source:",
                preparation.parseSource
            );
        }
        const ast = parseSourceWithRecovery(
            preparation.parseSource,
            parserOptions,
            activeOptions
        );

        Semantic.attachIdentifierCasePlanSnapshot(ast, activeOptions);
        filterParserComments(ast, activeOptions);

        // console.log("AST comments length:", ast.comments?.length);

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

    const { sourceText: commentFixedSource, indexMapper: commentFixMapper } =
        Parser.Utils.fixMalformedComments(featherResult.parseSource);

    if (process.env.GML_PRINTER_DEBUG) {
        console.debug("[DEBUG] commentFixedSource:", commentFixedSource);
    }

    const conditionalResult = Transforms.sanitizeConditionalAssignments(
        commentFixedSource
    ) as SanitizerResult;
    const conditionalSource = normalizeToString(
        conditionalResult.sourceText,
        commentFixedSource
    );

    const callSanitizedResult =
        (options?.sanitizeMissingArgumentSeparators ?? true)
            ? (Transforms.sanitizeMissingArgumentSeparators(
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
        preprocessedFixMetadata: featherResult.metadata,
        commentFixMapper
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

    const result = Transforms.preprocessSourceForFeatherFixes(sourceText) as
        | FeatherPreprocessCandidate
        | null
        | undefined;

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
    parserOptions: ReturnType<typeof createParserOptions>,
    options?: GmlParserAdapterOptions
): MutableGameMakerAstNode {
    try {
        const ast = Parser.GMLParser.parse(
            sourceText,
            parserOptions
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
            parserOptions
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

    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const normalizedOptions = Core.normalizeLineCommentOptions(
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
    Transforms.preprocessFunctionArgumentDefaultsTransform.transform(ast);

    if (options?.applyFeatherFixes) {
        const featherOptions = options
            ? { ...options, removeStandaloneVertexEnd: true }
            : { removeStandaloneVertexEnd: true };

        Transforms.applyFeatherFixesTransform.transform(ast, {
            sourceText: context.parseSource,
            preprocessedFixMetadata: context.preprocessedFixMetadata,
            options: featherOptions
        });
    }

    if (options?.condenseStructAssignments ?? true) {
        Transforms.consolidateStructAssignmentsTransform.transform(ast, {
            commentTools: { addTrailingComment }
        });
    }

    if (options?.normalizeDocComments ?? true) {
        Transforms.docCommentNormalizationTransform.transform(ast, {
            pluginOptions: options ?? {}
        });
    }

    applyIndexAdjustments(ast, context);
}

function applyIndexAdjustments(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext
): void {
    Transforms.applyIndexAdjustmentsIfPresent(
        ast,
        context.callIndexAdjustments,
        Transforms.applySanitizedIndexAdjustments,
        context.preprocessedFixMetadata
    );

    Transforms.applyIndexAdjustmentsIfPresent(
        ast,
        context.conditionalAssignmentIndexAdjustments,
        Transforms.applySanitizedIndexAdjustments,
        context.preprocessedFixMetadata
    );

    if (context.commentFixMapper) {
        Core.remapLocationMetadata(ast, context.commentFixMapper);
    }

    Transforms.applyIndexAdjustmentsIfPresent(
        ast,
        context.enumIndexAdjustments,
        Transforms.applyRemovedIndexAdjustments,
        context.preprocessedFixMetadata
    );
}

function applyOptionalTransforms(
    ast: MutableGameMakerAstNode,
    context: ParserPreparationContext,
    options: GmlParserAdapterOptions | undefined
): void {
    if (options?.useStringInterpolation) {
        Transforms.convertStringConcatenationsTransform.transform(ast);
    }

    if (options?.condenseLogicalExpressions) {
        Transforms.condenseLogicalExpressionsTransform.transform(ast);
    }

    if (options?.optimizeMathExpressions) {
        Transforms.optimizeMathExpressionsTransform.transform(ast, {
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
    if (options?.stripComments) {
        Transforms.stripCommentsTransform.transform(ast);
    }

    Transforms.convertUndefinedGuardAssignmentsTransform.transform(ast);
    Transforms.annotateStaticFunctionOverridesTransform.transform(ast);
    Transforms.collapseRedundantMissingCallArgumentsTransform.transform(ast);
    if (options?.optimizeLoopLengthHoisting ?? true) {
        Transforms.hoistLoopLengthBounds(ast, options);
    }
    Transforms.enforceVariableBlockSpacingTransform.transform(ast);

    Transforms.markCallsMissingArgumentSeparatorsTransform.transform(ast, {
        originalText: options?.originalText ?? originalSource
    });
}

/**
 * Creates a GML parser adapter with the provided configuration.
 * This factory function enables dependency injection for the scope tracker factory.
 */
export function createGmlParserAdapter(config: GmlParserAdapterConfig) {
    const parserOptions = createParserOptions(config);

    function parse(text: string, options?: GmlParserAdapterOptions) {
        return parseImpl(text, parserOptions, options);
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

    return {
        parse,
        astFormat: "gml-ast" as const,
        locStart,
        locEnd
    };
}

/**
 * Default GML parser adapter instance with the standard Semantic scope tracker.
 * Preserved for backward compatibility with existing consumers.
 */
export const gmlParserAdapter = createGmlParserAdapter({
    scopeTrackerFactory: () => new Semantic.SemanticScopeCoordinator()
});
