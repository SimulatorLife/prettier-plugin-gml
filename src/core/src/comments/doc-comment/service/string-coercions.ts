import { getNonEmptyString } from "../utils.js";

export interface DocCommentStringCoercions {
    coerceNonEmptyString(value: string): string | null;
}

export const defaultDocCommentStringCoercions: DocCommentStringCoercions = Object.freeze({
    coerceNonEmptyString: getNonEmptyString
});
