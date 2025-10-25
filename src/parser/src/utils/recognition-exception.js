import { hasFunction, isErrorLike } from "../shared/utils/capability-probes.js";
import { isObjectLike } from "../shared/object-utils.js";

function hasOffendingTokenProbe(value) {
    if (value?.offendingToken !== undefined) {
        return true;
    }

    if (value?.offendingSymbol !== undefined) {
        return true;
    }

    return hasFunction(value, "getOffendingToken");
}

function hasExpectedTokensProbe(value) {
    if (value?.expectedTokens !== undefined) {
        return true;
    }

    return hasFunction(value, "getExpectedTokens");
}

function hasContextProbe(value) {
    const context = value?.ctx ?? value?.context ?? null;
    if (isObjectLike(context)) {
        return true;
    }

    if (isObjectLike(value?.input)) {
        return true;
    }

    return typeof value?.offendingState === "number";
}

/**
 * Check whether {@link value} mirrors the surface area exposed by ANTLR's
 * `RecognitionException`. Parser recoverability helpers need to gracefully
 * inspect both native ANTLR errors and thin wrappers thrown by downstream
 * tooling, so this guard deliberately checks multiple field names instead of
 * relying on `instanceof`.
 *
 * @param {unknown} value Arbitrary error-like object.
 * @returns {value is import("antlr4/error/Errors").RecognitionException}
 *          `true` when {@link value} appears to expose the expected token,
 *          offending token, and context metadata provided by ANTLR.
 */
export function isRecognitionExceptionLike(value) {
    if (!isErrorLike(value)) {
        return false;
    }

    if (!hasExpectedTokensProbe(value)) {
        return false;
    }

    if (!hasOffendingTokenProbe(value)) {
        return false;
    }

    if (!hasContextProbe(value)) {
        return false;
    }

    return true;
}
