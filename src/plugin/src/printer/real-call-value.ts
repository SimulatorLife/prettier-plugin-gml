import { Core } from "@gml-modules/core";

import { NUMERIC_STRING_LITERAL_PATTERN } from "../constants.js";

function getNumericStringLiteralValue(node) {
    if (!node || node.type !== "Literal") {
        return null;
    }

    const rawValue = typeof node.value === "string" ? node.value : null;

    if (!rawValue) {
        return null;
    }

    let literalText = null;

    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        literalText = rawValue.slice(2, -1);
    } else if (rawValue.length >= 2) {
        const startingQuote = rawValue[0];
        const endingQuote = rawValue.at(-1);

        if ((startingQuote === '"' || startingQuote === "'") && startingQuote === endingQuote) {
            literalText = Core.stripStringQuotes(rawValue);
        }
    }

    if (literalText === undefined || literalText === null) {
        return null;
    }

    const trimmed = Core.toTrimmedString(literalText);

    if (trimmed.length === 0) {
        return null;
    }

    return NUMERIC_STRING_LITERAL_PATTERN.test(trimmed) ? trimmed : null;
}

export function getNumericValueFromRealCall(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const { object, arguments: args } = node;
    if (!object || object.type !== "Identifier" || !Array.isArray(args) || args.length !== 1) {
        return null;
    }

    const calleeName = Core.getIdentifierText(object);
    if (!calleeName || calleeName.toLowerCase() !== "real") {
        return null;
    }

    const argument = args[0];
    if (!argument || argument.type !== "Literal" || argument._skipNumericStringCoercion !== true) {
        return null;
    }

    return getNumericStringLiteralValue(argument);
}
