import { stripCommentsTransform } from "./strip-comments.js";
import { consolidateStructAssignments } from "./consolidate-struct-assignments.js";
import { condenseLogicalExpressions } from "./condense-logical-expressions.js";
import { applyFeatherFixes } from "./apply-feather-fixes.js";
import { preprocessFunctionArgumentDefaults } from "./preprocess-function-argument-defaults.js";
import { enforceVariableBlockSpacing } from "./enforce-variable-block-spacing.js";
import { convertStringConcatenations } from "./convert-string-concatenations.js";
import { convertManualMathExpressions } from "./convert-manual-math.js";
import { convertUndefinedGuardAssignments } from "./convert-undefined-guard-assignments.js";
import { annotateStaticFunctionOverrides } from "./annotate-static-overrides.js";
// Plugin AST transforms exposed via the parser transform registry.
// Wrappers follow the parser transform signature: (ast, opts = {}) => ast
const TRANSFORM_REGISTRY = Object.freeze({
    "strip-comments": stripCommentsTransform,
    "consolidate-struct-assignments": (ast, opts: any = {}) =>
        consolidateStructAssignments(ast, opts.commentTools),
    "apply-feather-fixes": (ast, opts: any = {}) =>
        applyFeatherFixes(ast, opts),
    "preprocess-function-argument-defaults": (ast, opts: any = {}) =>
        preprocessFunctionArgumentDefaults(ast, opts.helpers ?? opts),
    "enforce-variable-block-spacing": (ast, opts: any = {}) =>
        enforceVariableBlockSpacing(ast, opts),
    "convert-string-concatenations": (ast, opts: any = {}) =>
        convertStringConcatenations(ast, opts.helpers ?? opts),
    "condense-logical-expressions": (ast, opts: any = {}) =>
        condenseLogicalExpressions(ast, opts.helpers ?? opts),
    "convert-manual-math": (ast, opts: any = {}) =>
        convertManualMathExpressions(ast, opts),
    "convert-undefined-guard-assignments": (ast) =>
        convertUndefinedGuardAssignments(ast),
    "annotate-static-overrides": (ast, opts: any = {}) =>
        annotateStaticFunctionOverrides(ast, opts)
});

export function applyTransforms(
    ast: any,
    transformNames: any[] = [],
    options: any = {}
) {
    if (!Array.isArray(transformNames) || transformNames.length === 0) {
        return ast;
    }

    let current = ast;
    for (const name of transformNames) {
        const fn = TRANSFORM_REGISTRY[name];
        if (typeof fn !== "function") {
            throw new TypeError(`Unknown transform: ${String(name)}`);
        }

        current = fn(current, options[name] || {});
    }

    return current;
}

export const availableTransforms = Object.keys(TRANSFORM_REGISTRY);

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
export { annotateStaticFunctionOverrides } from "./annotate-static-overrides.js";
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
