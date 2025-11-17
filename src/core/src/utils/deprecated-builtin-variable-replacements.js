import { getFeatherDiagnosticById } from "../resources/feather-metadata.js";

const IDENTIFIER_TOKEN_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const RESERVED_KEYWORD_TOKENS = new Set([
    "and",
    "break",
    "case",
    "continue",
    "constructor",
    "create",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "event",
    "for",
    "function",
    "globalvar",
    "if",
    "macro",
    "not",
    "or",
    "repeat",
    "return",
    "step",
    "switch",
    "until",
    "var",
    "while",
    "with"
]);

export function buildDeprecatedBuiltinVariableReplacements() {
    const replacements = new Map();
    const diagnostic = getFeatherDiagnosticById("GM1024");

    if (!diagnostic) {
        return replacements;
    }

    const entries = deriveDeprecatedBuiltinVariableReplacementsFromExamples(
        diagnostic.badExample,
        diagnostic.goodExample
    );

    for (const entry of entries) {
        if (!replacements.has(entry.normalized)) {
            replacements.set(entry.normalized, entry);
        }
    }

    return replacements;
}

function deriveDeprecatedBuiltinVariableReplacementsFromExamples(
    badExample,
    goodExample
) {
    const entries = [];
    const badTokens = extractIdentifierTokens(badExample);
    const goodTokens = extractIdentifierTokens(goodExample);

    if (badTokens.length === 0 || goodTokens.length === 0) {
        return entries;
    }

    const goodTokenSet = new Set(goodTokens.map((token) => token.normalized));
    const deprecatedTokens = badTokens.filter(
        (token) => !goodTokenSet.has(token.normalized)
    );

    if (deprecatedTokens.length === 0) {
        return entries;
    }

    const badTokenSet = new Set(badTokens.map((token) => token.normalized));
    const replacementTokens = goodTokens.filter(
        (token) => !badTokenSet.has(token.normalized)
    );

    const pairCount = Math.min(
        deprecatedTokens.length,
        replacementTokens.length
    );

    for (let index = 0; index < pairCount; index += 1) {
        const deprecatedToken = deprecatedTokens[index];
        const replacementToken = replacementTokens[index];

        if (!deprecatedToken || !replacementToken) {
            continue;
        }

        entries.push({
            normalized: deprecatedToken.normalized,
            deprecated: deprecatedToken.token,
            replacement: replacementToken.token
        });
    }

    return entries;
}

function extractIdentifierTokens(text) {
    if (typeof text !== "string" || text.length === 0) {
        return [];
    }

    const matches = text.match(IDENTIFIER_TOKEN_PATTERN) ?? [];
    const tokens = [];
    const seen = new Set();

    for (const match of matches) {
        const normalized = match.toLowerCase();

        if (RESERVED_KEYWORD_TOKENS.has(normalized)) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        tokens.push({ token: match, normalized });
    }

    return tokens;
}

export function getDeprecatedBuiltinReplacementEntry(name) {
    if (!name) {
        return null;
    }

    if (!getDeprecatedBuiltinReplacementEntry._map) {
        getDeprecatedBuiltinReplacementEntry._map =
            buildDeprecatedBuiltinVariableReplacements();
    }

    return getDeprecatedBuiltinReplacementEntry._map.get(name) ?? null;
}
