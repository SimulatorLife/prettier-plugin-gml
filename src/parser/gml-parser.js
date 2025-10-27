export { default, getLineBreakCount } from "./src/gml-parser.js";
export { GameMakerSyntaxError } from "./src/gml-syntax-error.js";
export {
    sanitizeConditionalAssignments,
    applySanitizedIndexAdjustments
} from "./src/conditional-assignment-sanitizer.js";
export { isSyntaxErrorWithLocation } from "./src/utils/syntax-error-guards.js";
export {
    default as GameMakerLanguageParserVisitor,
    VISIT_METHOD_NAMES
} from "./src/extensions/game-maker-language-parser-visitor.js";
export {
    default as GameMakerLanguageParserListener,
    LISTENER_METHOD_NAMES
} from "./src/extensions/game-maker-language-parser-listener.js";
