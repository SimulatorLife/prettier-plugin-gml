import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { stripCommentsTransform } from "./strip-comments.js";
import { consolidateStructAssignmentsTransform } from "./consolidate-struct-assignments.js";
import { condenseLogicalExpressionsTransform } from "./condense-logical-expressions.js";
import { applyFeatherFixesTransform } from "./apply-feather-fixes.js";
import { preprocessFunctionArgumentDefaultsTransform } from "./preprocess-function-argument-defaults.js";
import { enforceVariableBlockSpacingTransform } from "./enforce-variable-block-spacing.js";
import { convertStringConcatenationsTransform } from "./convert-string-concatenations.js";
import { optimizeMathExpressionsTransform } from "./optimize-math-expressions.js";
import { convertUndefinedGuardAssignmentsTransform } from "./convert-undefined-guard-assignments.js";
import { annotateStaticFunctionOverridesTransform } from "./annotate-static-overrides.js";
import { collapseRedundantMissingCallArgumentsTransform } from "./collapse-redundant-arguments.js";
import { markCallsMissingArgumentSeparatorsTransform } from "./mark-missing-separators.js";

import { ParserTransform } from "./functional-transform.js";

type TransformOptions = Record<string, unknown>;

// Plugin AST transforms exposed via the parser transform registry.
const TRANSFORM_REGISTRY_ENTRIES = [
    ["strip-comments", stripCommentsTransform],
    ["consolidate-struct-assignments", consolidateStructAssignmentsTransform],
    ["apply-feather-fixes", applyFeatherFixesTransform],
    [
        "preprocess-function-argument-defaults",
        preprocessFunctionArgumentDefaultsTransform
    ],
    ["enforce-variable-block-spacing", enforceVariableBlockSpacingTransform],
    ["convert-string-concatenations", convertStringConcatenationsTransform],
    ["condense-logical-expressions", condenseLogicalExpressionsTransform],
    ["optimize-math-expressions", optimizeMathExpressionsTransform],
    [
        "convert-undefined-guard-assignments",
        convertUndefinedGuardAssignmentsTransform
    ],
    ["annotate-static-overrides", annotateStaticFunctionOverridesTransform],
    [
        "collapse-redundant-missing-call-arguments",
        collapseRedundantMissingCallArgumentsTransform
    ],
    [
        "mark-calls-missing-argument-separators",
        markCallsMissingArgumentSeparatorsTransform
    ]
] as const;

type TransformName = (typeof TRANSFORM_REGISTRY_ENTRIES)[number][0];
type TransformValue = ParserTransform<
    MutableGameMakerAstNode,
    TransformOptions
>;

export type ParserTransformName = TransformName;
export type ParserTransformOptions = TransformOptions;

const TRANSFORM_REGISTRY = new Map<TransformName, TransformValue>(
    TRANSFORM_REGISTRY_ENTRIES as ReadonlyArray<
        readonly [TransformName, TransformValue]
    >
);

export function isParserTransformName(
    value: unknown
): value is ParserTransformName {
    return (
        typeof value === "string" &&
        TRANSFORM_REGISTRY.has(value as TransformName)
    );
}

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
    applyFeatherFixesTransform,
    getFeatherDiagnosticFixers,
    getRoomNavigationHelpers,
    ROOM_NAVIGATION_DIRECTION
} from "./apply-feather-fixes.js";
export {
    applyRemovedIndexAdjustments,
    preprocessSourceForFeatherFixes
} from "./feather/enum-handling.js";
export { condenseLogicalExpressionsTransform } from "./condense-logical-expressions.js";
export { consolidateStructAssignmentsTransform } from "./consolidate-struct-assignments.js";
export { CommentTracker } from "./utils/comment-tracker.js";
export { optimizeMathExpressionsTransform } from "./optimize-math-expressions.js";
export { convertStringConcatenationsTransform } from "./convert-string-concatenations.js";
export { convertUndefinedGuardAssignmentsTransform } from "./convert-undefined-guard-assignments.js";
export { enforceVariableBlockSpacingTransform } from "./enforce-variable-block-spacing.js";
export { preprocessFunctionArgumentDefaultsTransform } from "./preprocess-function-argument-defaults.js";
export { stripCommentsTransform } from "./strip-comments.js";
export { annotateStaticFunctionOverridesTransform } from "./annotate-static-overrides.js";
export {
    conditionalAssignmentSanitizerTransform,
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "./conditional-assignment-sanitizer.js";
export { applyIndexAdjustmentsIfPresent } from "./index-adjustments.js";
export { sanitizeMissingArgumentSeparators } from "./missing-argument-separator-sanitizer.js";
export { collapseRedundantMissingCallArgumentsTransform } from "./collapse-redundant-arguments.js";
export { markCallsMissingArgumentSeparatorsTransform } from "./mark-missing-separators.js";
