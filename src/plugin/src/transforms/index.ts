import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { stripCommentsTransformInstance } from "./strip-comments.js";
import { consolidateStructAssignmentsTransform } from "./consolidate-struct-assignments.js";
import { condenseLogicalExpressionsTransform } from "./condense-logical-expressions.js";
import { applyFeatherFixesTransform } from "./apply-feather-fixes.js";
import { preprocessFunctionArgumentDefaultsTransform } from "./preprocess-function-argument-defaults.js";
import { enforceVariableBlockSpacingTransform } from "./enforce-variable-block-spacing.js";
import { convertStringConcatenationsTransform } from "./convert-string-concatenations.js";
import {
    convertManualMathExpressionsTransform,
    condenseScalarMultipliersTransform
} from "./convert-manual-math.js";
import { convertUndefinedGuardAssignmentsTransform } from "./convert-undefined-guard-assignments.js";
import { annotateStaticFunctionOverridesTransform } from "./annotate-static-overrides.js";

import { ParserTransform } from "./functional-transform.js";

type TransformOptions = Record<string, unknown>;

// Plugin AST transforms exposed via the parser transform registry.
const TRANSFORM_REGISTRY_ENTRIES = [
    ["strip-comments", stripCommentsTransformInstance],
    ["consolidate-struct-assignments", consolidateStructAssignmentsTransform],
    ["apply-feather-fixes", applyFeatherFixesTransform],
    [
        "preprocess-function-argument-defaults",
        preprocessFunctionArgumentDefaultsTransform
    ],
    ["enforce-variable-block-spacing", enforceVariableBlockSpacingTransform],
    ["convert-string-concatenations", convertStringConcatenationsTransform],
    ["condense-logical-expressions", condenseLogicalExpressionsTransform],
    ["convert-manual-math", convertManualMathExpressionsTransform],
    ["condense-scalar-multipliers", condenseScalarMultipliersTransform],
    [
        "convert-undefined-guard-assignments",
        convertUndefinedGuardAssignmentsTransform
    ],
    ["annotate-static-overrides", annotateStaticFunctionOverridesTransform]
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
    applyFeatherFixes,
    getFeatherDiagnosticFixers,
    getRoomNavigationHelpers,
    ROOM_NAVIGATION_DIRECTION
} from "./apply-feather-fixes.js";
export {
    applyRemovedIndexAdjustments,
    preprocessSourceForFeatherFixes
} from "./feather/enum-handling.js";
export { condenseLogicalExpressions } from "./condense-logical-expressions.js";
export { consolidateStructAssignments } from "./consolidate-struct-assignments.js";
export { CommentTracker } from "./utils/comment-tracker.js";
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
