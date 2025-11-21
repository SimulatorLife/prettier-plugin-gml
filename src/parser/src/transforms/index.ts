import * as stripComments from "./strip-comments.js";
import * as consolidateStructAssignments from "./consolidate-struct-assignments.js";
import * as applyFeatherFixes from "./apply-feather-fixes.js";
import * as preprocessFunctionArgumentDefaults from "./preprocess-function-argument-defaults.js";
import * as enforceVariableBlockSpacing from "./enforce-variable-block-spacing.js";
import * as convertStringConcatenations from "./convert-string-concatenations.js";
import * as condenseLogicalExpressions from "./condense-logical-expressions.js";
import * as convertManualMathExpressions from "./convert-manual-math.js";
import * as convertUndefinedGuardAssignments from "./convert-undefined-guard-assignments.js";
import * as annotateStaticFunctionOverrides from "./annotate-static-overrides.js";

// Plugin AST transforms exposed via the parser transform registry.
// Wrappers follow the parser transform signature: (ast, opts = {}) => ast
const TRANSFORM_REGISTRY = Object.freeze({
    "strip-comments": stripComments.transform,
    "consolidate-struct-assignments": (ast, opts = {}) =>
        consolidateStructAssignments.transform(ast, opts.commentTools),
    "apply-feather-fixes": (ast, opts = {}) =>
        applyFeatherFixes.transform(ast, opts),
    "preprocess-function-argument-defaults": (ast, opts = {}) =>
        preprocessFunctionArgumentDefaults.transform(ast, opts.helpers ?? opts),
    "enforce-variable-block-spacing": (ast, opts = {}) =>
        enforceVariableBlockSpacing.transform(ast, opts),
    "convert-string-concatenations": (ast, opts = {}) =>
        convertStringConcatenations.transform(ast, opts.helpers ?? opts),
    "condense-logical-expressions": (ast, opts = {}) =>
        condenseLogicalExpressions.transform(ast, opts.helpers ?? opts),
    "convert-manual-math": (ast, opts = {}) =>
        convertManualMathExpressions.transform(ast, opts),
    "convert-undefined-guard-assignments": (ast, opts = {}) =>
        convertUndefinedGuardAssignments.transform(ast, opts),
    "annotate-static-overrides": (ast, opts = {}) =>
        annotateStaticFunctionOverrides.transform(ast, opts)
});

export function applyTransforms(ast, transformNames = [], options = {}) {
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
