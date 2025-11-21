import { Core } from "@gml-modules/core";

const DEFAULT_WARNING_FALLBACK = "Unknown error";

function resolveWarningReason(candidates, fallback = DEFAULT_WARNING_FALLBACK) {
    const stack = [];
    for (let i = candidates.length - 1; i >= 0; i--) {
        stack.push(candidates[i]);
    }

    while (stack.length > 0) {
        const candidate = stack.pop();

        if (Array.isArray(candidate)) {
            for (let index = candidate.length - 1; index >= 0; index -= 1) {
                stack.push(candidate[index]);
            }
            continue;
        }

        const reason = Core.Utils.getErrorMessage(candidate, { fallback: "" });
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
