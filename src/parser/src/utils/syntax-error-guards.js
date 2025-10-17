import { isErrorLike } from "../../../shared/utils/capability-probes.js";

export function isSyntaxErrorWithLocation(value) {
    if (!isErrorLike(value)) {
        return false;
    }

    const hasFiniteLine = Number.isFinite(Number(value.line));
    const hasFiniteColumn = Number.isFinite(Number(value.column));

    if (!hasFiniteLine && !hasFiniteColumn) {
        return false;
    }

    if (value.rule != undefined && typeof value.rule !== "string") {
        return false;
    }

    if (
        value.wrongSymbol != undefined &&
        typeof value.wrongSymbol !== "string"
    ) {
        return false;
    }

    if (
        value.offendingText != undefined &&
        typeof value.offendingText !== "string"
    ) {
        return false;
    }

    return true;
}
