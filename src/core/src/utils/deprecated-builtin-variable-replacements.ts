import { getFeatherDiagnosticById } from "../resources/feather-metadata.js";

// GML keywords that should be excluded when extracting identifiers from examples.
const GML_KEYWORDS = new Set([
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
    const diagnostic = getFeatherDiagnosticById("GM1024");
    if (!diagnostic?.badExample || !diagnostic?.goodExample) {
        return new Map();
    }

    return deriveReplacementsFromExamples(
        diagnostic.badExample,
        diagnostic.goodExample
    );
}

/**
 * Extract deprecated variable replacements by comparing bad and good code examples.
 * Finds identifiers that appear in the bad example but not the good example (deprecated),
 * paired with identifiers that appear in the good example but not the bad (replacements).
 */
function deriveReplacementsFromExamples(badExample, goodExample) {
    const badIdentifiers = extractUserIdentifiers(badExample);
    const goodIdentifiers = extractUserIdentifiers(goodExample);

    if (badIdentifiers.length === 0 || goodIdentifiers.length === 0) {
        return new Map();
    }

    // Find identifiers unique to each example.
    const goodSet = new Set(goodIdentifiers.map((id) => id.toLowerCase()));
    const deprecated = badIdentifiers.filter(
        (id) => !goodSet.has(id.toLowerCase())
    );

    const badSet = new Set(badIdentifiers.map((id) => id.toLowerCase()));
    const replacements = goodIdentifiers.filter(
        (id) => !badSet.has(id.toLowerCase())
    );

    // Pair deprecated identifiers with their replacements by position.
    const pairs = new Map();
    const count = Math.min(deprecated.length, replacements.length);
    for (let i = 0; i < count; i++) {
        const deprecatedName = deprecated[i];
        const replacementName = replacements[i];
        pairs.set(deprecatedName.toLowerCase(), {
            normalized: deprecatedName.toLowerCase(),
            deprecated: deprecatedName,
            replacement: replacementName
        });
    }

    return pairs;
}

/**
 * Extract user-defined identifiers from code, excluding GML keywords.
 * Preserves original casing and returns unique identifiers in order of first appearance.
 */
function extractUserIdentifiers(code) {
    if (!code || typeof code !== "string") {
        return [];
    }

    const identifierPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
    const seenLowercase = new Set();
    const identifiers = [];

    for (const match of code.matchAll(identifierPattern)) {
        const identifier = match[0];
        const lowercase = identifier.toLowerCase();

        if (GML_KEYWORDS.has(lowercase) || seenLowercase.has(lowercase)) {
            continue;
        }

        seenLowercase.add(lowercase);
        identifiers.push(identifier);
    }

    return identifiers;
}

type DeprecatedReplacementCacheHolder = {
    _map?: ReturnType<typeof buildDeprecatedBuiltinVariableReplacements>;
};

export function getDeprecatedBuiltinReplacementEntry(name) {
    if (!name) {
        return null;
    }

    const cache =
        getDeprecatedBuiltinReplacementEntry as typeof getDeprecatedBuiltinReplacementEntry &
            DeprecatedReplacementCacheHolder;

    if (!cache._map) {
        cache._map = buildDeprecatedBuiltinVariableReplacements();
    }

    return cache._map.get(name) ?? null;
}
