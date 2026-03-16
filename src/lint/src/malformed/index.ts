export {
    forEachScientificNotationToken,
    isScientificNotationBoundary,
    SCIENTIFIC_NOTATION_PATTERN
} from "./scientific-notation-scan.js";
export type { CommentFixResult } from "./source-preprocessing.js";
export { fixMalformedComments, recoverParseSourceFromMissingBrace } from "./source-preprocessing.js";
