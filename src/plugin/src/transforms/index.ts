import type { MutableGameMakerAstNode } from "@gml-modules/core";

import { enforceVariableBlockSpacingTransform } from "./enforce-variable-block-spacing.js";
import type { ParserTransform } from "./functional-transform.js";
import { markCallsMissingArgumentSeparatorsTransform } from "./mark-missing-separators.js";
import { stripCommentsTransform } from "./strip-comments.js";

/**
 * Central registry for parser transforms exposed by the formatter pipeline.
 * This list intentionally excludes semantic/content rewrites owned by lint.
 */
const TRANSFORM_REGISTRY_ENTRIES = [
    stripCommentsTransform,
    enforceVariableBlockSpacingTransform,
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

const TRANSFORM_REGISTRY = {} as Record<string, RegisteredTransform>;
for (const transform of TRANSFORM_REGISTRY_ENTRIES) {
    if (Object.hasOwn(TRANSFORM_REGISTRY, transform.name)) {
        throw new Error(`Duplicate parser transform registered: ${transform.name}`);
    }

    TRANSFORM_REGISTRY[transform.name] = transform;
}

export function getParserTransform<Name extends ParserTransformName>(name: Name): TransformByName[Name] {
    const transform = TRANSFORM_REGISTRY[name] as TransformByName[Name];
    if (!transform) {
        throw new TypeError(`Unknown parser transform: ${String(name)}`);
    }

    return transform;
}

export function isParserTransformName(value: unknown): value is ParserTransformName {
    return typeof value === "string" && Object.hasOwn(TRANSFORM_REGISTRY, value);
}

/**
 * Apply the requested transforms in curated order.
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
        const transform = getParserTransform(name) as {
            transform: (ast: MutableGameMakerAstNode, options?: unknown) => MutableGameMakerAstNode;
        };
        current = transform.transform(current, options[name]);
    }

    return current;
}

export const availableTransforms = TRANSFORM_REGISTRY_ENTRIES.map(
    (transform) => transform.name
) as readonly ParserTransformName[];

export {
    applySanitizedIndexAdjustments,
    conditionalAssignmentSanitizerTransform,
    sanitizeConditionalAssignments
} from "./conditional-assignment-sanitizer.js";
export { precomputeSyntheticDocComments } from "./doc-comment/precompute-synthetic-doc-comments.js";
export { enforceVariableBlockSpacingTransform } from "./enforce-variable-block-spacing.js";
export { applyIndexAdjustmentsIfPresent } from "./index-adjustments.js";
export { markCallsMissingArgumentSeparatorsTransform } from "./mark-missing-separators.js";
export { stripCommentsTransform } from "./strip-comments.js";
export { CommentTracker } from "./utils/comment-tracker.js";
