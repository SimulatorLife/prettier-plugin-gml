// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the plugin configuration.

import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { Parser, type ScopeTracker } from "@gml-modules/parser";

import * as Transforms from "../transforms/index.js";

const { getNodeStartIndex, getNodeEndIndex } = Core;
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
    [key: string]: unknown;
};

/**
 * Runtime hooks used by the parser adapter for identifier-case coordination.
 */
export type IdentifierCaseRuntime = {
    readonly createScopeTracker: ScopeTrackerFactory;
    readonly prepareIdentifierCaseEnvironment: (options?: GmlParserAdapterOptions) => Promise<void>;
    readonly teardownIdentifierCaseEnvironment: (options?: GmlParserAdapterOptions) => void;
    readonly attachIdentifierCasePlanSnapshot: (
        ast: MutableGameMakerAstNode,
        options?: GmlParserAdapterOptions
    ) => void;
};

const DEFAULT_IDENTIFIER_CASE_RUNTIME = Object.freeze({
    createScopeTracker: () => null,
    prepareIdentifierCaseEnvironment: async () => {},
    teardownIdentifierCaseEnvironment: () => {},
    attachIdentifierCasePlanSnapshot: () => {}
}) as IdentifierCaseRuntime;

let identifierCaseRuntime = DEFAULT_IDENTIFIER_CASE_RUNTIME;

/**
 * Configure identifier-case runtime hooks used by the default parser adapter.
 *
 * @param {IdentifierCaseRuntime} runtime Runtime hooks for scope tracking,
 *        environment lifecycle, and plan snapshot attachment.
 */
export function setIdentifierCaseRuntime(runtime: IdentifierCaseRuntime): void {
    identifierCaseRuntime = runtime;
}

type ParserPreparationContext = {
    parseSource: string;
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

    if (activeOptions) {
        Reflect.set(activeOptions, "originalText", text);
    }

    try {
        environmentPrepared = await prepareIdentifierCaseEnvironment(activeOptions);

        const preparation = preprocessSource(text);
        const ast = parseSourceWithRecovery(preparation.parseSource, parserOptions);

        identifierCaseRuntime.attachIdentifierCasePlanSnapshot(ast, activeOptions);
        filterParserComments(ast, activeOptions);

        if (!ast || typeof ast !== "object") {
            throw new Error("GameMaker parser returned no AST for the provided source.");
        }

        applyParserTransforms(ast, preparation, activeOptions, text);
        return ast;
    } catch (error) {
        if (environmentPrepared || activeOptions?.__identifierCaseProjectIndexBootstrap) {
            identifierCaseRuntime.teardownIdentifierCaseEnvironment(activeOptions);
        }

        throw error;
    }
}

async function prepareIdentifierCaseEnvironment(options?: GmlParserAdapterOptions): Promise<boolean> {
    if (!options) {
        return false;
    }

    await identifierCaseRuntime.prepareIdentifierCaseEnvironment(options);
    return true;
}

function preprocessSource(text: string): ParserPreparationContext {
    return {
        parseSource: text
    };
}

function parseSourceWithRecovery(
    sourceText: string,
    parserOptions: ReturnType<typeof createParserOptions>
): MutableGameMakerAstNode {
    return Parser.GMLParser.parse(sourceText, parserOptions) as MutableGameMakerAstNode;
}

function filterParserComments(ast: MutableGameMakerAstNode, options?: GmlParserAdapterOptions): void {
    const comments = ast.comments;
    if (!Array.isArray(comments)) {
        return;
    }

    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const normalizedOptions = Core.normalizeLineCommentOptions(lineCommentOptions) as {
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
    applyStructuralTransforms(ast, options);
    applyOptionalTransforms(ast, context, options);
    applyFinalTransforms(ast, context, options, originalSource);
}

function applyStructuralTransforms(ast: MutableGameMakerAstNode, _options: GmlParserAdapterOptions | undefined): void {
    void ast;
}

function applyOptionalTransforms(
    ast: MutableGameMakerAstNode,
    _context: ParserPreparationContext,
    _options: GmlParserAdapterOptions | undefined
): void {
    void ast;
}

function applyFinalTransforms(
    ast: MutableGameMakerAstNode,
    _context: ParserPreparationContext,
    options: GmlParserAdapterOptions | undefined,
    originalSource: string
): void {
    if (options?.stripComments) {
        Transforms.stripCommentsTransform.transform(ast);
    }

    Transforms.enforceVariableBlockSpacingTransform.transform(ast);

    Transforms.markCallsMissingArgumentSeparatorsTransform.transform(ast, {
        originalText: options?.originalText ?? originalSource
    });
}

function getParserLocStart(node: MutableGameMakerAstNode): number {
    if (!node) {
        return 0;
    }
    if (node.type === "Program") {
        return 0;
    }
    return getNodeStartIndex(node) ?? 0;
}

function getParserLocEnd(node: MutableGameMakerAstNode): number {
    return getNodeEndIndex(node) ?? 0;
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

    return {
        parse,
        astFormat: "gml-ast" as const,
        locStart: getParserLocStart,
        locEnd: getParserLocEnd
    };
}

/**
 * Default GML parser adapter instance.
 * Scope tracking and identifier-case lifecycle hooks are injected at runtime
 * via {@link setIdentifierCaseRuntime}.
 */
export const gmlParserAdapter = createGmlParserAdapter({
    scopeTrackerFactory: () => identifierCaseRuntime.createScopeTracker()
});
