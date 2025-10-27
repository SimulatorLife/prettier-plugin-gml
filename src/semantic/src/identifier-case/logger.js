import { getErrorMessage } from "../shared/index.js";

const DEFAULT_WARNING_FALLBACK = "Unknown error";

function resolveWarningReason(candidates, fallback = DEFAULT_WARNING_FALLBACK) {
    const stack = [...candidates].reverse();

    while (stack.length > 0) {
        const candidate = stack.pop();

        if (Array.isArray(candidate)) {
            for (let index = candidate.length - 1; index >= 0; index -= 1) {
                stack.push(candidate[index]);
            }
            continue;
        }

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
