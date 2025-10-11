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
      segment.match(/[A-Z]+(?=[A-Z][a-z0-9])|[A-Z]?[a-z0-9]+|[0-9]+|[A-Z]+/g) ||
      [];
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

function capitalize(value) {
    if (!value) {
        return value;
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
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

function buildCamelCase(normalized) {
    const { tokens } = normalized;
    if (tokens.length === 0) {
        return finalizeIdentifier(normalized, "");
    }

    let base = "";
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type === "number") {
            base += token.normalized;
            continue;
        }

        if (index === 0) {
            base += token.normalized;
        } else {
            base += capitalize(token.normalized);
        }
    }

    return finalizeIdentifier(normalized, base);
}

function buildPascalCase(normalized) {
    const { tokens } = normalized;
    if (tokens.length === 0) {
        return finalizeIdentifier(normalized, "");
    }

    let base = "";
    for (const token of tokens) {
        if (token.type === "number") {
            base += token.normalized;
        } else {
            base += capitalize(token.normalized);
        }
    }

    return finalizeIdentifier(normalized, base);
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
    if (token.type === "word") {
        return token.normalized;
    }

    return token.normalized;
}

function transformSnakeUpper(token) {
    if (token.type === "word") {
        return token.normalized.toUpperCase();
    }

    return token.normalized;
}

export function normalizeIdentifierCase(identifier) {
    if (typeof identifier !== "string") {
        throw new TypeError("Identifier must be a string");
    }

    const { prefix, remainder: withoutPrefix } =
    extractReservedPrefix(identifier);
    const {
        core: withoutNumericSuffix,
        suffixSeparator,
        suffixDigits
    } = splitNumericSuffix(withoutPrefix);
    const { core, leading, trailing } =
    stripEdgeUnderscores(withoutNumericSuffix);

    const tokens = tokenizeCore(core);

    return {
        original: identifier,
        prefix,
        leadingUnderscores: leading,
        trailingUnderscores: trailing,
        suffixSeparator,
        suffixDigits,
        tokens
    };
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
