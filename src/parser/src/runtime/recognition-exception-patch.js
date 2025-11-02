import antlr4 from "antlr4";

import { hasFunction, isErrorLike, isObjectLike } from "../shared/index.js";

const INVALID_INDEX_FALLBACK = -1;
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

function firstNumber(...values) {
    for (const value of values) {
        if (typeof value === "number") {
            return value;
        }
    }

    return;
}

function getTokenStream(recognizer) {
    if (recognizer && typeof recognizer.getTokenStream === "function") {
        return recognizer.getTokenStream();
    }

    return recognizer?._input ?? null;
}

function ensureTokenMetadata(token, { fallbackCandidates = [], stream } = {}) {
    if (!token || typeof token !== "object") {
        return null;
    }

    const candidates = Array.isArray(fallbackCandidates)
        ? fallbackCandidates
        : [fallbackCandidates];
    const fallback = candidates.find(
        (candidate) => candidate && typeof candidate === "object"
    );

    if (typeof token.type !== "number") {
        token.type =
            typeof fallback?.type === "number"
                ? fallback.type
                : antlr4.Token.INVALID_TYPE;
    }

    if (typeof token.tokenIndex !== "number") {
        const fallbackIndex = firstNumber(
            fallback?.tokenIndex,
            token.index,
            token.startIndex
        );

        token.tokenIndex =
            fallbackIndex ??
            (typeof stream?.index === "number"
                ? stream.index
                : INVALID_INDEX_FALLBACK);
    }

    if (typeof token.line !== "number") {
        token.line =
            firstNumber(
                fallback?.line,
                fallback?.start?.line,
                token.start?.line
            ) ?? INVALID_INDEX_FALLBACK;
    }

    if (typeof token.column !== "number") {
        token.column =
            firstNumber(
                fallback?.column,
                fallback?.start?.column,
                token.start?.column
            ) ?? INVALID_INDEX_FALLBACK;
    }

    return token;
}

function ensureOffendingToken(recognizer, exception) {
    if (!exception || typeof exception !== "object") {
        return;
    }

    const stream = getTokenStream(recognizer);
    const context =
        exception.ctx ?? exception.context ?? recognizer?._ctx ?? null;

    let offendingToken =
        exception.offendingToken ?? exception.offendingSymbol ?? null;

    if (!offendingToken && typeof exception.getOffendingToken === "function") {
        offendingToken = exception.getOffendingToken();
    }

    if (!offendingToken && context?.stop) {
        offendingToken = context.stop;
    }

    if (!offendingToken && context?.start) {
        offendingToken = context.start;
    }

    if (!offendingToken && typeof recognizer?.getCurrentToken === "function") {
        offendingToken = recognizer.getCurrentToken();
    }

    if (!offendingToken && stream?.LT) {
        offendingToken = stream.LT(1);
    }

    if (!offendingToken) {
        offendingToken = {
            type: antlr4.Token.INVALID_TYPE,
            tokenIndex: INVALID_INDEX_FALLBACK,
            line: INVALID_INDEX_FALLBACK,
            column: INVALID_INDEX_FALLBACK
        };
    }

    exception.offendingToken = ensureTokenMetadata(offendingToken, {
        fallbackCandidates: [context?.stop, context?.start],
        stream
    });

    if (typeof exception.getOffendingToken !== "function") {
        Object.defineProperty(exception, "getOffendingToken", {
            configurable: true,
            value() {
                return this.offendingToken ?? null;
            }
        });
    }
}

function ensureStartToken(recognizer, exception) {
    if (!exception || typeof exception !== "object") {
        return;
    }

    const stream = getTokenStream(recognizer);
    const context =
        exception.ctx ?? exception.context ?? recognizer?._ctx ?? null;

    let startToken =
        exception.startToken ??
        context?.start ??
        exception.offendingToken ??
        context?.stop ??
        null;

    if (!startToken && typeof recognizer?.getCurrentToken === "function") {
        startToken = recognizer.getCurrentToken();
    }

    if (!startToken && stream?.LT) {
        const previous = stream.LT(-1);
        startToken = previous ?? stream.LT(1);
    }

    if (!startToken) {
        startToken = {
            type:
                typeof exception.offendingToken?.type === "number"
                    ? exception.offendingToken.type
                    : antlr4.Token.INVALID_TYPE,
            tokenIndex:
                typeof exception.offendingToken?.tokenIndex === "number"
                    ? exception.offendingToken.tokenIndex
                    : INVALID_INDEX_FALLBACK,
            line:
                typeof exception.offendingToken?.line === "number"
                    ? exception.offendingToken.line
                    : INVALID_INDEX_FALLBACK,
            column:
                typeof exception.offendingToken?.column === "number"
                    ? exception.offendingToken.column
                    : INVALID_INDEX_FALLBACK
        };
    }

    exception.startToken = ensureTokenMetadata(startToken, {
        fallbackCandidates: [context?.start, exception.offendingToken],
        stream
    });
}

let isPatched = false;

export function installRecognitionExceptionLikeGuard() {
    if (isPatched) {
        return;
    }

    const recognitionException = antlr4?.error?.RecognitionException;
    if (typeof recognitionException !== "function") {
        return;
    }

    const originalHasInstance = recognitionException[Symbol.hasInstance];

    Object.defineProperty(recognitionException, Symbol.hasInstance, {
        configurable: true,
        value(candidate) {
            if (
                typeof originalHasInstance === "function" &&
                originalHasInstance.call(this, candidate)
            ) {
                return true;
            }

            return isRecognitionExceptionLike(candidate);
        }
    });

    const defaultErrorStrategy = antlr4?.error?.DefaultErrorStrategy;
    if (typeof defaultErrorStrategy === "function") {
        const originalReportNoViable =
            defaultErrorStrategy.prototype.reportNoViableAlternative;
        Object.defineProperty(
            defaultErrorStrategy.prototype,
            "reportNoViableAlternative",
            {
                configurable: true,
                value(recognizer, exception) {
                    if (exception && typeof exception === "object") {
                        ensureOffendingToken(recognizer, exception);
                        ensureStartToken(recognizer, exception);
                    }

                    return originalReportNoViable.call(
                        this,
                        recognizer,
                        exception
                    );
                }
            }
        );
    }

    isPatched = true;
}
