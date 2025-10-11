const IDENTIFIER_CASE_VALUES = new Set([
    "off",
    "camel",
    "pascal",
    "snake-lower",
    "snake-upper"
]);

const IDENTIFIER_CASE_OVERRIDE_VALUES = new Set([
    "inherit",
    ...IDENTIFIER_CASE_VALUES
]);

const IDENTIFIER_CASE_SCOPE_OPTION_MAP = new Map([
    ["functions", "gmlIdentifierCaseFunctions"],
    ["structs", "gmlIdentifierCaseStructs"],
    ["locals", "gmlIdentifierCaseLocals"],
    ["instance", "gmlIdentifierCaseInstance"],
    ["globals", "gmlIdentifierCaseGlobals"],
    ["assets", "gmlIdentifierCaseAssets"],
    ["macros", "gmlIdentifierCaseMacros"]
]);

const DEFAULT_OVERRIDE = "inherit";
const DEFAULT_BASE_CASE = "off";

function normalizeCaseChoice(value, validChoices, { optionName }) {
    const stringValue = typeof value === "string" ? value.trim() : value;

    if (stringValue === undefined || stringValue === null || stringValue === "") {
        return null;
    }

    if (!validChoices.has(stringValue)) {
        const allowed = [...validChoices].sort().join(", ");
        throw new Error(
            `Unsupported value '${stringValue}' for ${optionName}. Expected one of: ${allowed}.`
        );
    }

    return stringValue;
}

function parseCommaSeparatedList(optionValue) {
    if (typeof optionValue !== "string") {
        return [];
    }

    return optionValue
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export function normalizeIdentifierCaseOptions(rawOptions = {}) {
    const baseCaseOption = Object.hasOwn(rawOptions, "gmlIdentifierCase")
        ? rawOptions.gmlIdentifierCase
        : DEFAULT_BASE_CASE;

    const normalizedBaseCase =
    normalizeCaseChoice(baseCaseOption, IDENTIFIER_CASE_VALUES, {
        optionName: "gmlIdentifierCase"
    }) ?? DEFAULT_BASE_CASE;

    const scopes = {};

    for (const [scopeName, optionKey] of IDENTIFIER_CASE_SCOPE_OPTION_MAP) {
        const overrideOption = Object.hasOwn(rawOptions, optionKey)
            ? rawOptions[optionKey]
            : DEFAULT_OVERRIDE;

        const normalizedOverride =
      normalizeCaseChoice(overrideOption, IDENTIFIER_CASE_OVERRIDE_VALUES, {
          optionName: optionKey
      }) ?? DEFAULT_OVERRIDE;

        scopes[scopeName] =
      normalizedOverride === "inherit"
          ? normalizedBaseCase
          : normalizedOverride;
    }

    const ignorePatterns = parseCommaSeparatedList(
        rawOptions.gmlIdentifierCaseIgnore
    );
    const preservedIdentifiers = parseCommaSeparatedList(
        rawOptions.gmlIdentifierCasePreserve
    );

    const assetCase = scopes.assets;
    const acknowledgesAssetUpdates = Boolean(
        rawOptions.gmlIdentifierCaseAcknowledgeAssetUpdates
    );

    if (assetCase !== "off" && !acknowledgesAssetUpdates) {
        throw new Error(
            "Enabling gmlIdentifierCase for assets requires setting gmlIdentifierCaseAcknowledgeAssetUpdates to true to confirm disk updates."
        );
    }

    return {
        baseCase: normalizedBaseCase,
        scopes,
        ignorePatterns,
        preservedIdentifiers,
        acknowledgesAssetUpdates
    };
}

export const identifierCaseScopeOptionMap = IDENTIFIER_CASE_SCOPE_OPTION_MAP;
