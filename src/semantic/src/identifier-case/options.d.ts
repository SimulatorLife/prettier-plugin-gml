export { DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES } from "./option-store-defaults.js";
export declare const IdentifierCaseStyle: Readonly<{
    OFF: "off";
    CAMEL: "camel";
    PASCAL: "pascal";
    SNAKE_LOWER: "snake-lower";
    SNAKE_UPPER: "snake-upper";
}>;
export declare const IDENTIFIER_CASE_STYLES: readonly ("off" | "camel" | "pascal" | "snake-lower" | "snake-upper")[];
export declare const IDENTIFIER_CASE_INHERIT_VALUE = "inherit";
export declare function isIdentifierCaseStyle(style: any): boolean;
export declare function assertIdentifierCaseStyle(style: any, optionName: any): any;
export declare const IDENTIFIER_CASE_SCOPE_NAMES: readonly string[];
export declare const IDENTIFIER_CASE_BASE_OPTION_NAME = "gmlIdentifierCase";
export declare const IDENTIFIER_CASE_IGNORE_OPTION_NAME = "gmlIdentifierCaseIgnore";
export declare const IDENTIFIER_CASE_PRESERVE_OPTION_NAME = "gmlIdentifierCasePreserve";
export declare const IDENTIFIER_CASE_ACKNOWLEDGE_ASSETS_OPTION_NAME = "gmlIdentifierCaseAcknowledgeAssetRenames";
export declare const IDENTIFIER_CASE_DISCOVER_PROJECT_OPTION_NAME = "gmlIdentifierCaseDiscoverProject";
export declare const IDENTIFIER_CASE_PROJECT_ROOT_OPTION_NAME = "gmlIdentifierCaseProjectRoot";
export declare const IDENTIFIER_CASE_PROJECT_INDEX_CACHE_MAX_BYTES_OPTION_NAME = "gmlIdentifierCaseProjectIndexCacheMaxBytes";
export declare const IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME = "gmlIdentifierCaseOptionStoreMaxEntries";
export declare const IDENTIFIER_CASE_PROJECT_INDEX_CONCURRENCY_OPTION_NAME = "gmlIdentifierCaseProjectIndexConcurrency";
export declare function normalizeIdentifierCaseAssetStyle(style: any): any;
export declare const IDENTIFIER_CASE_STYLE_CHOICES: {
    value: any;
    description: any;
}[];
export declare const identifierCaseOptions: {
    gmlIdentifierCase: {
        since: string;
        type: string;
        category: string;
        default: string;
        description: string;
        choices: {
            value: any;
            description: any;
        }[];
    };
    gmlIdentifierCaseIgnore: {
        since: string;
        type: string;
        category: string;
        default: string;
        description: string;
    };
    gmlIdentifierCasePreserve: {
        since: string;
        type: string;
        category: string;
        default: string;
        description: string;
    };
    gmlIdentifierCaseAcknowledgeAssetRenames: {
        since: string;
        type: string;
        category: string;
        default: boolean;
        description: string;
    };
    gmlIdentifierCaseDiscoverProject: {
        since: string;
        type: string;
        category: string;
        default: boolean;
        description: string;
    };
    gmlIdentifierCaseProjectRoot: {
        since: string;
        type: string;
        category: string;
        default: string;
        description: string;
    };
    gmlIdentifierCaseProjectIndexCacheMaxBytes: {
        since: string;
        type: string;
        category: string;
        default: any;
        range: {
            start: number;
            end: number;
        };
        description: string;
    };
};
/**
 * Normalize the user-provided identifier case options into the canonical
 * structure consumed by the semantic pass and project index integration.
 *
 * Accepts the raw Prettier option bag (which may omit any property) and
 * resolves it to the effective base style, per-scope overrides, and the
 * derived ignore/preserve lists. When the assets scope is enabled it also
 * enforces the acknowledgement flag so callers cannot accidentally trigger
 * renames without opting-in to the behavioural change.
 *
 * @param {Record<string, unknown>} [options]
 *        Partial prettier option bag keyed by `gmlIdentifierCase*` names.
 * @returns {{
 *     baseStyle: string,
 *     scopeSettings: Record<string, string>,
 *     scopeStyles: Record<string, string>,
 *     ignorePatterns: Array<string>,
 *     preservedIdentifiers: Array<string>,
 *     assetRenamesAcknowledged: boolean
 * }} Canonical representation consumed by identifier case services.
 * @throws {Error} When asset renames are enabled without acknowledgement.
 */
export declare function normalizeIdentifierCaseOptions(options?: {}): {
    baseStyle: any;
    scopeSettings: {};
    scopeStyles: {};
    ignorePatterns: any;
    preservedIdentifiers: any;
    assetRenamesAcknowledged: boolean;
};
export declare function getIdentifierCaseScopeOptionName(scope: any): string;
