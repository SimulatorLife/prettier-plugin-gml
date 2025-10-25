import { getErrorMessage } from "../shared/index.js";

const DEFAULT_WARNING_FALLBACK = "Unknown error";

function* iterateWarningCandidates(candidates) {
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            yield* iterateWarningCandidates(candidate);
            continue;
        }

        yield candidate;
    }
}

function resolveWarningReason(candidates, fallback = DEFAULT_WARNING_FALLBACK) {
    for (const candidate of iterateWarningCandidates(candidates)) {
        const reason = getErrorMessage(candidate, { fallback: "" });
        if (reason) {
            return reason;
        }
    }

    return fallback;
}

export function warnWithReason(logger, namespace, message, ...candidates) {
    if (typeof logger?.warn !== "function") {
        return;
    }

    const reason = resolveWarningReason(candidates);
    const suffix = reason ? `: ${reason}` : "";

    logger.warn(`[${namespace}] ${message}${suffix}`);
}
