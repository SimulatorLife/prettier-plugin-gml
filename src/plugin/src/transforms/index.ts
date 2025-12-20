import type { MutableGameMakerAstNode } from "@gml-modules/core";
import { applyFeatherFixesTransform } from "./apply-feather-fixes.js";
import { annotateStaticFunctionOverridesTransform } from "./annotate-static-overrides.js";
import { collapseRedundantMissingCallArgumentsTransform } from "./collapse-redundant-arguments.js";
import { condenseLogicalExpressionsTransform } from "./condense-logical-expressions.js";
import { consolidateStructAssignmentsTransform } from "./consolidate-struct-assignments.js";
import { convertStringConcatenationsTransform } from "./convert-string-concatenations.js";
import { convertUndefinedGuardAssignmentsTransform } from "./convert-undefined-guard-assignments.js";
import { enforceVariableBlockSpacingTransform } from "./enforce-variable-block-spacing.js";
import { markCallsMissingArgumentSeparatorsTransform } from "./mark-missing-separators.js";
import { optimizeMathExpressionsTransform } from "./optimize-math-expressions.js";
import { preprocessFunctionArgumentDefaultsTransform } from "./preprocess-function-argument-defaults.js";
import { stripCommentsTransform } from "./strip-comments.js";
import { docCommentNormalizationTransform } from "./doc-comment-normalization.js";
import type { ParserTransform } from "./functional-transform.js";

/**
 * Central registry for parser transforms exposed by the plugin pipeline.
 * Each entry is referenced by name when `applyTransforms` runs, ensuring a single curated order.
 */
const TRANSFORM_REGISTRY_ENTRIES = [
    stripCommentsTransform,
    consolidateStructAssignmentsTransform,
    applyFeatherFixesTransform,
    preprocessFunctionArgumentDefaultsTransform,
    enforceVariableBlockSpacingTransform,
    convertStringConcatenationsTransform,
    condenseLogicalExpressionsTransform,
    optimizeMathExpressionsTransform,
    docCommentNormalizationTransform,
    convertUndefinedGuardAssignmentsTransform,
    annotateStaticFunctionOverridesTransform,
    collapseRedundantMissingCallArgumentsTransform,
    markCallsMissingArgumentSeparatorsTransform
] as const;

type RegisteredTransform = (typeof TRANSFORM_REGISTRY_ENTRIES)[number];
export type ParserTransformName = RegisteredTransform["name"];
export type ParserTransformOptions = {
    readonly [Transform in RegisteredTransform as Transform["name"]]: Transform extends ParserTransform<
        MutableGameMakerAstNode,
        infer Options
    >
        ? Options
        : never;
};
type TransformByName = {
    [Transform in RegisteredTransform as Transform["name"]]: Transform;
};

const TRANSFORM_REGISTRY = {} as TransformByName;
for (const transform of TRANSFORM_REGISTRY_ENTRIES) {
    if (Object.hasOwn(TRANSFORM_REGISTRY, transform.name)) {
        throw new Error(
            `Duplicate parser transform registered: ${transform.name}`
        );
    }

    TRANSFORM_REGISTRY[transform.name] = transform;
}

export function getParserTransform<Name extends ParserTransformName>(
    name: Name
): TransformByName[Name] {
    const transform = TRANSFORM_REGISTRY[name];
    if (!transform) {
        throw new TypeError(`Unknown parser transform: ${String(name)}`);
    }

    return transform;
}

export function isParserTransformName(
    value: unknown
): value is ParserTransformName {
    return (
        typeof value === "string" && Object.hasOwn(TRANSFORM_REGISTRY, value)
    );
}

/**
 * Apply the requested transforms in the curated order so the plugin can share a single normalization pipeline.
 */
export function applyTransforms(
    ast: MutableGameMakerAstNode,
    transformNames: readonly ParserTransformName[] = [],
    options: Readonly<Partial<Record<string, unknown>>> = {}
) {
    if (transformNames.length === 0) {
        return ast;
    }

    let current = ast;
    for (const name of transformNames) {
        const transform = getParserTransform(name);
        current = transform.transform(current, options[name] as never);
    }

    return current;
}

export const availableTransforms = TRANSFORM_REGISTRY_ENTRIES.map(
    (transform) => transform.name
) as readonly ParserTransformName[];

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
export { hoistLoopLengthBounds } from "./loop-size-hoisting/index.js";
export { docCommentNormalizationTransform } from "./doc-comment-normalization.js";
