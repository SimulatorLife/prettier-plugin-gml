import ParserImpl, { getLineBreakCount } from "./src/gml-parser.js";
import { Core } from "@gml-modules/core";

const {
    DeprecatedBuiltinVariables: {
        buildDeprecatedBuiltinVariableReplacements,
        getDeprecatedBuiltinReplacementEntry
    },
    Utils: { createResolverController }
} = Core;

export default ParserImpl;
export { getLineBreakCount };
export { GameMakerSyntaxError } from "./src/gml-syntax-error.js";
export {
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "./src/conditional-assignment-sanitizer.js";
export { isSyntaxErrorWithLocation } from "./src/utils/syntax-error-guards.js";
export { convertToESTree } from "./src/utils/estree-converter.js";
export {
    default as GameMakerLanguageParserVisitor,
    VISIT_METHOD_NAMES
} from "./src/runtime/game-maker-language-parser-visitor.js";
export {
    default as GameMakerLanguageParserListener,
    LISTENER_METHOD_NAMES
} from "./src/runtime/game-maker-language-parser-listener.js";
export * from "./src/transforms/index.js";
export * from "./src/transforms/annotate-static-overrides.js";
export * from "./src/transforms/apply-feather-fixes.js";
export * from "./src/transforms/condense-logical-expressions.js";
export * from "./src/transforms/consolidate-struct-assignments.js";
export * from "./src/transforms/convert-manual-math.js";
export * from "./src/transforms/convert-string-concatenations.js";
export * from "./src/transforms/convert-undefined-guard-assignments.js";
export * from "./src/transforms/enforce-variable-block-spacing.js";
export * from "./src/transforms/preprocess-function-argument-defaults.js";
export * from "./src/transforms/strip-comments.js";
export {
    buildDeprecatedBuiltinVariableReplacements,
    getDeprecatedBuiltinReplacementEntry,
    createResolverController
};
export {
    getStructPropertyAccess,
    isBinaryOperator
} from "./src/ast/node-helpers.js";
