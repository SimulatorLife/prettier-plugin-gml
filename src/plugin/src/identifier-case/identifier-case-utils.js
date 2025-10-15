import {
    capitalize,
    normalizeStringList
} from "../../../shared/string-utils.js";

const RESERVED_PREFIX_PATTERN =
    /^(?<prefix>(?:global|other|self|local|with|noone)\.|argument(?:_(?:local|relative))?(?:\[\d+\]|\d+)?\.?)/;

function extractReservedPrefix(identifier) {
    const match = identifier.match(RESERVED_PREFIX_PATTERN);
    if (!match) {
        return { prefix: "", remainder: identifier };
    }

    const { prefix } = match.groups;
    return { prefix, remainder: identifier.slice(prefix.length) };
}

function splitNumericSuffix(text) {
    const match = text.match(/(_?\d+)$/);
    if (!match) {
        return { core: text, suffixSeparator: "", suffixDigits: "" };
    }

    const [fullMatch] = match;
    const suffixDigits = fullMatch.replace(/^_/, "");
    const suffixSeparator = fullMatch.startsWith("_") ? "_" : "";
    return {
        core: text.slice(0, -fullMatch.length),
        suffixSeparator,
        suffixDigits
    };
}

function stripEdgeUnderscores(text) {
    const leadingMatch = text.match(/^_+/);
    const trailingMatch = text.match(/_+$/);

    const leading = leadingMatch ? leadingMatch[0] : "";
    const trailing = trailingMatch ? trailingMatch[0] : "";

    const core = text.slice(leading.length, text.length - trailing.length);
    return { core, leading, trailing };
}

function tokenizeCore(core) {
    if (!core) {
        return [];
    }

    const rawSegments = core
        .split(/_+/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    const tokens = [];
    for (const segment of rawSegments) {
        const caseSegments =
            segment.match(
                /[A-Z]+(?=[A-Z][a-z0-9])|[A-Z]?[a-z0-9]+|[0-9]+|[A-Z]+/g
            ) || [];
        for (const caseSegment of caseSegments) {
            const parts = caseSegment.match(/[A-Za-z]+|[0-9]+/g) || [];
            for (const part of parts) {
                const isNumber = /^\d+$/.test(part);
                const normalized = isNumber ? part : part.toLowerCase();
                tokens.push({ normalized, type: isNumber ? "number" : "word" });
            }
        }
    }

    return tokens;
}

function finalizeIdentifier(normalized, base) {
    const suffix = normalized.suffixDigits
        ? normalized.suffixSeparator + normalized.suffixDigits
        : "";
    return (
        normalized.prefix +
        normalized.leadingUnderscores +
        base +
        normalized.trailingUnderscores +
        suffix
    );
}

function buildWordCase(normalized, transformToken) {
    const { tokens } = normalized;
    if (tokens.length === 0) {
        return finalizeIdentifier(normalized, "");
    }

    let base = "";
    for (let index = 0; index < tokens.length; index += 1) {
        base += transformToken(tokens[index], index);
    }

    return finalizeIdentifier(normalized, base);
}

function buildCamelCase(normalized) {
    return buildWordCase(normalized, (token, index) => {
        if (token.type === "number") {
            return token.normalized;
        }

        if (index === 0) {
            return token.normalized;
        }

        return capitalize(token.normalized);
    });
}

function buildPascalCase(normalized) {
    return buildWordCase(normalized, (token) =>
        token.type === "number"
            ? token.normalized
            : capitalize(token.normalized)
    );
}

function shouldJoinForSnake(previousToken, currentToken) {
    return (
        (previousToken.type === "word" && currentToken.type === "number") ||
        (previousToken.type === "number" && currentToken.type === "word")
    );
}

function buildSnakeCase(normalized, transform) {
    const { tokens } = normalized;
    if (tokens.length === 0) {
        return finalizeIdentifier(normalized, "");
    }

    let base = transform(tokens[0]);
    for (let index = 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        const previous = tokens[index - 1];
        const text = transform(token);

        if (shouldJoinForSnake(previous, token)) {
            base += text;
        } else {
            base += `_${text}`;
        }
    }

    return finalizeIdentifier(normalized, base);
}

function transformSnakeLower(token) {
    return token.normalized;
}

function transformSnakeUpper(token) {
    const { normalized, type } = token;
    if (type === "word") {
        return normalized.toUpperCase();
    }

    return normalized;
}

export function normalizeIdentifierCase(identifier) {
    if (typeof identifier !== "string") {
        throw new TypeError("Identifier must be a string");
    }

    const match = extractReservedPrefix(identifier);
    return buildNormalizedIdentifier(identifier, match);
}

export function formatIdentifierCase(input, style) {
    const normalized =
        typeof input === "string" ? normalizeIdentifierCase(input) : input;

    switch (style) {
        case "camel":
            return buildCamelCase(normalized);
        case "pascal":
            return buildPascalCase(normalized);
        case "snake-lower":
            return buildSnakeCase(normalized, transformSnakeLower);
        case "snake-upper":
            return buildSnakeCase(normalized, transformSnakeUpper);
        default:
            throw new Error(`Unsupported identifier case: ${style}`);
    }
}

export function isIdentifierCase(identifier, style) {
    const normalized = normalizeIdentifierCase(identifier);
    return formatIdentifierCase(normalized, style) === identifier;
}

export const RESERVED_IDENTIFIER_PREFIXES = Object.freeze([
    "global.",
    "other.",
    "self.",
    "local.",
    "with.",
    "noone.",
    "argument",
    "argument_local",
    "argument_relative"
]);

function normalizeReservedPrefixOverrides(overrides) {
    if (
        !overrides ||
        typeof overrides === "string" ||
        typeof overrides[Symbol.iterator] !== "function"
    ) {
        return [];
    }

    const entries = normalizeStringList(Array.from(overrides));

    if (entries.length === 0) {
        return [];
    }

    return entries.sort((a, b) => {
        const lengthDifference = b.length - a.length;
        return lengthDifference || (a < b ? -1 : a > b ? 1 : 0);
    });
}

function extractReservedPrefixWithOverrides(identifier, overrides) {
    const baseMatch = extractReservedPrefix(identifier);
    if (baseMatch.prefix || overrides.length === 0) {
        return baseMatch;
    }

    for (const prefix of overrides) {
        if (identifier.startsWith(prefix)) {
            return { prefix, remainder: identifier.slice(prefix.length) };
        }
    }

    return baseMatch;
}

function buildNormalizedIdentifier(identifier, match) {
    const {
        core: withoutNumericSuffix,
        suffixSeparator,
        suffixDigits
    } = splitNumericSuffix(match.remainder);
    const { core, leading, trailing } =
        stripEdgeUnderscores(withoutNumericSuffix);

    const tokens = tokenizeCore(core);

    return {
        original: identifier,
        prefix: match.prefix,
        leadingUnderscores: leading,
        trailingUnderscores: trailing,
        suffixSeparator,
        suffixDigits,
        tokens
    };
}

export function normalizeIdentifierCaseWithOptions(identifier, options = {}) {
    const overrides = normalizeReservedPrefixOverrides(
        options.reservedPrefixes
    );
    if (overrides.length === 0) {
        return normalizeIdentifierCase(identifier);
    }

    if (typeof identifier !== "string") {
        throw new TypeError("Identifier must be a string");
    }

    const match = extractReservedPrefixWithOverrides(identifier, overrides);
    return buildNormalizedIdentifier(identifier, match);
}

export function formatIdentifierCaseWithOptions(input, style, options = {}) {
    const normalized =
        typeof input === "string"
            ? normalizeIdentifierCaseWithOptions(input, options)
            : input;

    return formatIdentifierCase(normalized, style);
}

export function isIdentifierCaseWithOptions(identifier, style, options = {}) {
    const normalized = normalizeIdentifierCaseWithOptions(identifier, options);
    return formatIdentifierCase(normalized, style) === identifier;
}
