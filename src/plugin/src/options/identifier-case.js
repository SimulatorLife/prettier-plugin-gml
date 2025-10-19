// Identifier-case option metadata and normalization helpers.
//
// Keeps option names, descriptions, and normalization utilities grouped in one
// place so the CLI, documentation, and project-index pipeline can share a
// single source of truth.

import {
    capitalize,
    normalizeStringList
} from "../../../shared/string-utils.js";
import { getDefaultProjectIndexCacheMaxSize } from "../project-index/cache.js";
import { getDefaultProjectIndexGmlConcurrency } from "../project-index/concurrency.js";

export const DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES = 128;

const IDENTIFIER_CASE_DESCRIPTION =
    "Sets the preferred casing style to apply when renaming identifiers.";

export const IdentifierCaseStyle = Object.freeze({
    OFF: "off",
    CAMEL: "camel",
    PASCAL: "pascal",
    SNAKE_LOWER: "snake-lower",
    SNAKE_UPPER: "snake-upper"
});

const IDENTIFIER_CASE_STYLE_SET = new Set(Object.values(IdentifierCaseStyle));

export const IDENTIFIER_CASE_STYLES = Object.freeze(
    Object.values(IdentifierCaseStyle)
);

export const IDENTIFIER_CASE_INHERIT_VALUE = "inherit";

function isIdentifierCaseStyle(style) {
    return IDENTIFIER_CASE_STYLE_SET.has(style);
}

function createUnknownIdentifierCaseStyleError(style, optionName) {
    const validStyles = Array.from(IDENTIFIER_CASE_STYLE_SET).join(", ");

    return new RangeError(
        `Invalid identifier case style '${style}' for ${optionName}. Valid styles: ${validStyles}.`
    );
}

function assertIdentifierCaseStyle(style, optionName) {
    if (!isIdentifierCaseStyle(style)) {
        throw createUnknownIdentifierCaseStyleError(style, optionName);
    }
}

function normalizeIdentifierCaseStyleOption(
    style,
    { optionName, defaultValue }
) {
    if (style === undefined) {
        return defaultValue;
    }

    assertIdentifierCaseStyle(style, optionName);

    return style;
}

export const IDENTIFIER_CASE_SCOPE_NAMES = Object.freeze([
    "functions",
    "structs",
    "locals",
    "instance",
    "globals",
    "assets",
    "macros"
]);

export const IDENTIFIER_CASE_BASE_OPTION_NAME = "gmlIdentifierCase";
export const IDENTIFIER_CASE_IGNORE_OPTION_NAME = "gmlIdentifierCaseIgnore";
export const IDENTIFIER_CASE_PRESERVE_OPTION_NAME = "gmlIdentifierCasePreserve";
export const IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME =
    "gmlIdentifierCaseAcknowledgeAssetRenames";
export const IDENTIFIER_CASE_DISCOVER_PROJECT_OPTION_NAME =
    "gmlIdentifierCaseDiscoverProject";
export const IDENTIFIER_CASE_PROJECT_ROOT_OPTION_NAME =
    "gmlIdentifierCaseProjectRoot";
export const IDENTIFIER_CASE_PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME =
    "gmlIdentifierCaseProjectIndexCacheMaxBytes";
export const IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME =
    "gmlIdentifierCaseOptionStoreMaxEntries";
export const IDENTIFIER_CASE_PROJECT_INDEX_CONCURRENCY_OPTION_NAME =
    "gmlIdentifierCaseProjectIndexConcurrency";

const IDENTIFIER_CASE_SCOPE_OPTION_PREFIX = "gmlIdentifierCase";

const BASE_IDENTIFIER_CASE_SINCE = "0.0.0";

function createChoice(value, description) {
    return { value, description };
}

export const IDENTIFIER_CASE_STYLE_CHOICES = IDENTIFIER_CASE_STYLES.map(
    (style) => {
        switch (style) {
            case "off": {
                return createChoice(
                    style,
                    "Disable automatic identifier case rewriting."
                );
            }
            case "camel": {
                return createChoice(
                    style,
                    "Convert identifiers to lower camelCase (e.g. `exampleName`)."
                );
            }
            case "pascal": {
                return createChoice(
                    style,
                    "Convert identifiers to Upper PascalCase (e.g. `ExampleName`)."
                );
            }
            case "snake-lower": {
                return createChoice(
                    style,
                    "Convert identifiers to lower snake_case (e.g. `example_name`)."
                );
            }
            case "snake-upper": {
                return createChoice(
                    style,
                    "Convert identifiers to UPPER_SNAKE_CASE (e.g. `EXAMPLE_NAME`)."
                );
            }
            default: {
                return createChoice(style, IDENTIFIER_CASE_DESCRIPTION);
            }
        }
    }
);

function getScopeOptionName(scope) {
    return `${IDENTIFIER_CASE_SCOPE_OPTION_PREFIX}${capitalize(scope)}`;
}

function createScopeChoiceEntries() {
    const inheritChoice = createChoice(
        IDENTIFIER_CASE_INHERIT_VALUE,
        "Inherit the default gmlIdentifierCase value."
    );

    return [inheritChoice, ...IDENTIFIER_CASE_STYLE_CHOICES];
}

function createScopeOptionConfig(scope) {
    return {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "choice",
        category: "gml",
        default: IDENTIFIER_CASE_INHERIT_VALUE,
        description: `Overrides the base identifier case for ${scope} declarations.`,
        choices: createScopeChoiceEntries()
    };
}

export const identifierCaseOptions = {
    [IDENTIFIER_CASE_BASE_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "choice",
        category: "gml",
        default: "off",
        description:
            "Configures the default identifier case conversion style applied to eligible declarations.",
        choices: IDENTIFIER_CASE_STYLE_CHOICES
    },
    [IDENTIFIER_CASE_IGNORE_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "string",
        category: "gml",
        default: "",
        description:
            "Comma- or newline-separated patterns describing identifiers or files to ignore while renaming."
    },
    [IDENTIFIER_CASE_PRESERVE_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "string",
        category: "gml",
        default: "",
        description:
            "Comma- or newline-separated list of identifier names that must be preserved without renaming."
    },
    [IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "boolean",
        category: "gml",
        default: false,
        description:
            "Acknowledges that enabling asset renames may rename files on disk and updates related metadata."
    },
    [IDENTIFIER_CASE_DISCOVER_PROJECT_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "boolean",
        category: "gml",
        default: true,
        description:
            "Automatically search for the nearest GameMaker project manifest (.yyp) when preparing identifier case plans."
    },
    [IDENTIFIER_CASE_PROJECT_ROOT_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "path",
        category: "gml",
        default: "",
        description:
            "Overrides automatic discovery with an explicit GameMaker project root directory when building identifier indexes."
    },
    [IDENTIFIER_CASE_PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME]: {
        since: BASE_IDENTIFIER_CASE_SINCE,
        type: "int",
        category: "gml",
        default: getDefaultProjectIndexCacheMaxSize(),
        range: { start: 0, end: Infinity },
        description:
            "Maximum size in bytes for the project-index cache payload. Set to 0 to disable the limit when coordinating cache writes."
    }
};

identifierCaseOptions[IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME] = {
    since: BASE_IDENTIFIER_CASE_SINCE,
    type: "int",
    category: "gml",
    default: DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES,
    range: { start: 0, end: Infinity },
    description:
        "Maximum number of identifier-case option store entries to retain. Set to 0 to disable eviction entirely."
};

identifierCaseOptions[IDENTIFIER_CASE_PROJECT_INDEX_CONCURRENCY_OPTION_NAME] = {
    since: BASE_IDENTIFIER_CASE_SINCE,
    type: "int",
    category: "gml",
    default: getDefaultProjectIndexGmlConcurrency(),
    range: { start: 1, end: Infinity },
    description:
        "Maximum number of GameMaker files parsed in parallel while building identifier-case project indexes."
};

for (const scope of IDENTIFIER_CASE_SCOPE_NAMES) {
    const optionName = getScopeOptionName(scope);
    identifierCaseOptions[optionName] = createScopeOptionConfig(scope);
}

function normalizeList(optionName, value) {
    return normalizeStringList(value, {
        splitPattern: /[\n,]/,
        errorMessage: `${optionName} must be provided as a string or array of strings.`
    });
}

function resolveScopeSettings(options, baseStyle) {
    const scopeSettings = {};
    const scopeStyles = {};

    for (const scope of IDENTIFIER_CASE_SCOPE_NAMES) {
        const optionName = getScopeOptionName(scope);
        const configuredValue = options?.[optionName];

        const normalizedValue =
            configuredValue === undefined
                ? IDENTIFIER_CASE_INHERIT_VALUE
                : configuredValue;

        if (
            scope === "locals" &&
            normalizedValue !== IDENTIFIER_CASE_INHERIT_VALUE
        ) {
            assertIdentifierCaseStyle(normalizedValue, optionName);
        }

        scopeSettings[scope] = normalizedValue;

        scopeStyles[scope] =
            normalizedValue === IDENTIFIER_CASE_INHERIT_VALUE
                ? baseStyle
                : normalizedValue;
    }

    return { scopeSettings, scopeStyles };
}

export function normalizeIdentifierCaseOptions(options = {}) {
    const baseStyle = normalizeIdentifierCaseStyleOption(
        options?.[IDENTIFIER_CASE_BASE_OPTION_NAME],
        {
            optionName: IDENTIFIER_CASE_BASE_OPTION_NAME,
            defaultValue: IdentifierCaseStyle.OFF
        }
    );

    const { scopeSettings, scopeStyles } = resolveScopeSettings(
        options,
        baseStyle
    );

    const ignorePatterns = normalizeList(
        IDENTIFIER_CASE_IGNORE_OPTION_NAME,
        options?.[IDENTIFIER_CASE_IGNORE_OPTION_NAME]
    );
    const preservedIdentifiers = normalizeList(
        IDENTIFIER_CASE_PRESERVE_OPTION_NAME,
        options?.[IDENTIFIER_CASE_PRESERVE_OPTION_NAME]
    );

    const assetRenamesAcknowledged = Boolean(
        options?.[IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME]
    );

    const effectiveAssetStyle = scopeStyles.assets;
    const assetRenamesEnabled =
        effectiveAssetStyle && effectiveAssetStyle !== "off";

    if (assetRenamesEnabled && !assetRenamesAcknowledged) {
        throw new Error(
            "Enabling gmlIdentifierCaseAssets requires acknowledging asset renames via gmlIdentifierCaseAcknowledgeAssetRenames."
        );
    }

    return {
        baseStyle,
        scopeSettings,
        scopeStyles,
        ignorePatterns,
        preservedIdentifiers,
        assetRenamesAcknowledged
    };
}

export function getIdentifierCaseScopeOptionName(scope) {
    if (!IDENTIFIER_CASE_SCOPE_NAMES.includes(scope)) {
        throw new RangeError(`Unknown identifier case scope: ${scope}`);
    }

    return getScopeOptionName(scope);
}
