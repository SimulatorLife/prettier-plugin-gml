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

    const { rule, wrongSymbol, offendingText } = value;

    if (rule != undefined && typeof rule !== "string") {
        return false;
    }

    if (wrongSymbol != undefined && typeof wrongSymbol !== "string") {
        return false;
    }

    if (offendingText != undefined && typeof offendingText !== "string") {
        return false;
    }

    return true;
}
