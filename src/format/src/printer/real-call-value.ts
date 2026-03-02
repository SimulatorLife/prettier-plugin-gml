// TODO: What is this for? What does this do? Should be owned by the formatter?
import { Core } from "@gml-modules/core";

import { NUMERIC_STRING_LITERAL_PATTERN } from "./constants.js";

function getNumericStringLiteralValue(node) {
    if (!node || node.type !== "Literal") {
        return null;
    }

    const rawValue = typeof node.value === "string" ? node.value : null;

    if (!rawValue) {
        return null;
    }

    const literalText = extractLiteralText(rawValue);
    if (literalText === null) {
        return null;
    }

    const trimmed = Core.toTrimmedString(literalText);

    if (trimmed.length === 0) {
        return null;
    }

    return NUMERIC_STRING_LITERAL_PATTERN.test(trimmed) ? trimmed : null;
}

function extractLiteralText(rawValue) {
    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        return rawValue.slice(2, -1);
    }

    if (rawValue.length < 2) {
        return null;
    }

    const startingQuote = rawValue[0];
    const endingQuote = rawValue.at(-1);

    if ((startingQuote !== '"' && startingQuote !== "'") || startingQuote !== endingQuote) {
        return null;
    }

    return Core.stripStringQuotes(rawValue);
}

export function getNumericValueFromRealCall(node) {
    if (!Core.isCallExpressionIdentifierMatch(node, "real", { caseInsensitive: true })) {
        return null;
    }

    const args = node.arguments;
    if (!Array.isArray(args) || args.length !== 1) {
        return null;
    }

    const argument = args[0];
    if (!argument || argument.type !== "Literal") {
        return null;
    }

    return getNumericStringLiteralValue(argument);
}
