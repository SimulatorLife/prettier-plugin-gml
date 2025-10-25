import {
    hasFunction,
    isErrorLike
} from "../../../shared/utils/capability-probes.js";
import { isObjectLike } from "../../../shared/object-utils.js";

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
