import antlr4 from "antlr4";

import { isRecognitionExceptionLike } from "../utils/recognition-exception.js";

const INVALID_INDEX_FALLBACK = -1;

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
        if (typeof fallback?.tokenIndex === "number") {
            token.tokenIndex = fallback.tokenIndex;
        } else if (typeof token.index === "number") {
            token.tokenIndex = token.index;
        } else if (typeof token.startIndex === "number") {
            token.tokenIndex = token.startIndex;
        } else if (stream && typeof stream.index === "number") {
            token.tokenIndex = stream.index;
        } else {
            token.tokenIndex = INVALID_INDEX_FALLBACK;
        }
    }

    if (typeof token.line !== "number") {
        if (typeof fallback?.line === "number") {
            token.line = fallback.line;
        } else if (typeof fallback?.start?.line === "number") {
            token.line = fallback.start.line;
        } else if (typeof token.start?.line === "number") {
            token.line = token.start.line;
        } else {
            token.line = INVALID_INDEX_FALLBACK;
        }
    }

    if (typeof token.column !== "number") {
        if (typeof fallback?.column === "number") {
            token.column = fallback.column;
        } else if (typeof fallback?.start?.column === "number") {
            token.column = fallback.start.column;
        } else if (typeof token.start?.column === "number") {
            token.column = token.start.column;
        } else {
            token.column = INVALID_INDEX_FALLBACK;
        }
    }

    return token;
}

function ensureOffendingToken(recognizer, exception) {
    if (!exception || typeof exception !== "object") {
        return;
    }

    const stream = getTokenStream(recognizer);
    const context = exception.ctx ?? exception.context ?? recognizer?._ctx ?? null;

    let offendingToken =
        exception.offendingToken ??
        exception.offendingSymbol ??
        null;

    if (!offendingToken && typeof exception.getOffendingToken === "function") {
        offendingToken = exception.getOffendingToken();
    }

    if (!offendingToken && context?.stop) {
        offendingToken = context.stop;
    }

    if (!offendingToken && context?.start) {
        offendingToken = context.start;
    }

    if (
        !offendingToken &&
        typeof recognizer?.getCurrentToken === "function"
    ) {
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
    const context = exception.ctx ?? exception.context ?? recognizer?._ctx ?? null;

    let startToken =
        exception.startToken ??
        context?.start ??
        exception.offendingToken ??
        context?.stop ??
        null;

    if (
        !startToken &&
        typeof recognizer?.getCurrentToken === "function"
    ) {
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
            if (typeof originalHasInstance === "function") {
                if (originalHasInstance.call(this, candidate)) {
                    return true;
                }
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
