export { default, getLineBreakCount } from "./src/gml-parser.js";
export { GameMakerSyntaxError } from "./src/gml-syntax-error.js";
export {
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "./src/conditional-assignment-sanitizer.js";
export { isSyntaxErrorWithLocation } from "./src/utils/syntax-error-guards.js";
