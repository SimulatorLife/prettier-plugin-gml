import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { stripCommentsTransform } from "./strip-comments.js";
import { consolidateStructAssignments } from "./consolidate-struct-assignments.js";
import { condenseLogicalExpressions } from "./condense-logical-expressions.js";
import { applyFeatherFixes } from "./apply-feather-fixes.js";
import { preprocessFunctionArgumentDefaults } from "./preprocess-function-argument-defaults.js";
import { enforceVariableBlockSpacing } from "./enforce-variable-block-spacing.js";
import { convertStringConcatenations } from "./convert-string-concatenations.js";
import { convertManualMathExpressions } from "./convert-manual-math.js";
import { convertUndefinedGuardAssignments } from "./convert-undefined-guard-assignments.js";
import { transform as annotateStaticFunctionOverrides } from "./annotate-static-overrides.js";

type TransformOptions = Record<string, unknown>;

export interface ParserTransform<
    AstType extends MutableGameMakerAstNode = MutableGameMakerAstNode,
    Options extends TransformOptions = TransformOptions
> {
    readonly name: string;
    readonly defaultOptions: Options;
    transform(ast: AstType, options?: Options): AstType;
}

type EmptyTransformOptions = Record<string, never>;

export abstract class FunctionalParserTransform<
    Options extends TransformOptions = EmptyTransformOptions
> implements ParserTransform<MutableGameMakerAstNode, Options>
{
    public readonly name: string;
    public readonly defaultOptions: Options;

    constructor(name: string, defaultOptions: Options) {
        this.name = name;
        this.defaultOptions = Object.freeze({ ...defaultOptions }) as Options;
    }

    public transform(
        ast: MutableGameMakerAstNode,
        options?: Options
    ): MutableGameMakerAstNode {
        const resolvedOptions = options
            ? (Object.assign({}, this.defaultOptions, options) as Options)
            : this.defaultOptions;

        return this.execute(ast, resolvedOptions);
    }

    protected abstract execute(
        ast: MutableGameMakerAstNode,
        options: Options
    ): MutableGameMakerAstNode;
}

type CommentTools = {
    addTrailingComment: (...args: Array<unknown>) => unknown;
};

type StripCommentsTransformOptions = {
    stripComments: boolean;
    stripJsDoc: boolean;
    dropCommentedOutCode: boolean;
};

type ConsolidateStructAssignmentsOptions = {
    commentTools?: CommentTools | null;
};

type CondenseLogicalExpressionsOptions = {
    helpers?:
        | { hasComment: (node: unknown) => boolean }
        | ((node: unknown) => boolean)
        | null;
};

type ConvertManualMathTransformOptions = {
    sourceText?: string;
    originalText?: string;
};

type ApplyFeatherFixesOptions = {
    sourceText?: string;
    preprocessedFixMetadata?: unknown;
    options?: Record<string, unknown>;
};

type EnforceVariableBlockSpacingOptions = {
    variableBlockSpacingMinDeclarations?: number;
};

type EmptyTransformOptions = Record<string, never>;

const EMPTY_OPTIONS: EmptyTransformOptions = Object.freeze({});

class FunctionalParserTransformEntry<
    Options extends TransformOptions = EmptyTransformOptions
> extends FunctionalParserTransform<Options> {
    private readonly handler: (
        ast: MutableGameMakerAstNode,
        options: Options
    ) => MutableGameMakerAstNode;

    constructor(
        name: string,
        handler: (
            ast: MutableGameMakerAstNode,
            options: Options
        ) => MutableGameMakerAstNode,
        defaultOptions: Options
    ) {
        super(name, defaultOptions);
        this.handler = handler;
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        options: Options
    ): MutableGameMakerAstNode {
        return this.handler(ast, options);
    }
}
// Plugin AST transforms exposed via the parser transform registry.
// Wrappers follow the parser transform signature: (ast, opts = {}) => ast
const TRANSFORM_REGISTRY_ENTRIES = [
    [
        "strip-comments",
        new FunctionalParserTransformEntry<StripCommentsTransformOptions>(
            "strip-comments",
            (ast, options) =>
                stripCommentsTransform(ast, options) as MutableGameMakerAstNode,
            {
                stripComments: true,
                stripJsDoc: true,
                dropCommentedOutCode: false
            }
        )
    ],
    [
        "consolidate-struct-assignments",
        new FunctionalParserTransformEntry<ConsolidateStructAssignmentsOptions>(
            "consolidate-struct-assignments",
            (ast, options) =>
                consolidateStructAssignments(
                    ast,
                    options.commentTools
                ) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "apply-feather-fixes",
        new FunctionalParserTransformEntry<ApplyFeatherFixesOptions>(
            "apply-feather-fixes",
            (ast, options) =>
                applyFeatherFixes(ast, options) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "preprocess-function-argument-defaults",
        new FunctionalParserTransformEntry(
            "preprocess-function-argument-defaults",
            (ast) =>
                preprocessFunctionArgumentDefaults(
                    ast
                ) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "enforce-variable-block-spacing",
        new FunctionalParserTransformEntry<EnforceVariableBlockSpacingOptions>(
            "enforce-variable-block-spacing",
            (ast, options) => {
                enforceVariableBlockSpacing(ast, options);
                return ast;
            },
            EMPTY_OPTIONS
        )
    ],
    [
        "convert-string-concatenations",
        new FunctionalParserTransformEntry(
            "convert-string-concatenations",
            (ast) =>
                convertStringConcatenations(ast) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "condense-logical-expressions",
        new FunctionalParserTransformEntry<CondenseLogicalExpressionsOptions>(
            "condense-logical-expressions",
            (ast, options) =>
                condenseLogicalExpressions(
                    ast,
                    options?.helpers ?? options
                ) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "convert-manual-math",
        new FunctionalParserTransformEntry<ConvertManualMathTransformOptions>(
            "convert-manual-math",
            (ast, options) =>
                convertManualMathExpressions(
                    ast,
                    options
                ) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "convert-undefined-guard-assignments",
        new FunctionalParserTransformEntry(
            "convert-undefined-guard-assignments",
            (ast) =>
                convertUndefinedGuardAssignments(
                    ast
                ) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ],
    [
        "annotate-static-overrides",
        new FunctionalParserTransformEntry(
            "annotate-static-overrides",
            (ast, options) =>
                annotateStaticFunctionOverrides(
                    ast,
                    options
                ) as MutableGameMakerAstNode,
            EMPTY_OPTIONS
        )
    ]
] as const;

type TransformName = (typeof TRANSFORM_REGISTRY_ENTRIES)[number][0];
type TransformValue = ParserTransform<
    MutableGameMakerAstNode,
    TransformOptions
>;

const TRANSFORM_REGISTRY = new Map<TransformName, TransformValue>(
    TRANSFORM_REGISTRY_ENTRIES as ReadonlyArray<
        readonly [TransformName, TransformValue]
    >
);

export function applyTransforms(
    ast: MutableGameMakerAstNode,
    transformNames: readonly TransformName[] = [],
    options: Readonly<Partial<Record<TransformName, TransformOptions>>> = {}
) {
    if (transformNames.length === 0) {
        return ast;
    }

    let current = ast;
    for (const name of transformNames) {
        const transform = TRANSFORM_REGISTRY.get(name);
        if (!transform) {
            throw new TypeError(`Unknown transform: ${String(name)}`);
        }

        current = transform.transform(
            current,
            options[name] ?? transform.defaultOptions
        );
    }

    return current;
}

export const availableTransforms = Array.from(TRANSFORM_REGISTRY.keys());

export {
    applyFeatherFixes,
    applyRemovedIndexAdjustments,
    getFeatherDiagnosticFixers,
    getRoomNavigationHelpers,
    preprocessSourceForFeatherFixes,
    ROOM_NAVIGATION_DIRECTION
} from "./apply-feather-fixes.js";
export { condenseLogicalExpressions } from "./condense-logical-expressions.js";
export {
    consolidateStructAssignments,
    CommentTracker
} from "./consolidate-struct-assignments.js";
export {
    convertManualMathExpressions,
    condenseScalarMultipliers
} from "./convert-manual-math.js";
export { convertStringConcatenations } from "./convert-string-concatenations.js";
export { convertUndefinedGuardAssignments } from "./convert-undefined-guard-assignments.js";
export { enforceVariableBlockSpacing } from "./enforce-variable-block-spacing.js";
export { preprocessFunctionArgumentDefaults } from "./preprocess-function-argument-defaults.js";
export { stripCommentsTransform } from "./strip-comments.js";
export { transform as annotateStaticFunctionOverrides } from "./annotate-static-overrides.js";
export {
    conditionalAssignmentSanitizerTransform,
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "./conditional-assignment-sanitizer.js";
export { applyIndexAdjustmentsIfPresent } from "./index-adjustments.js";
export {
    sanitizeMissingArgumentSeparators,
    collapseRedundantMissingCallArguments,
    markCallsMissingArgumentSeparators
} from "./missing-argument-separator-sanitizer.js";
