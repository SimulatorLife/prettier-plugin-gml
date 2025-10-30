import {
    isNonEmptyString,
    getOrCreateMapEntry,
    isObjectLike,
    isFiniteNumber
} from "../shared/index.js";
import { IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME } from "./options.js";
import { getDefaultIdentifierCaseOptionStoreMaxEntries } from "./option-store-defaults.js";

const optionStoreMap = new Map();
const STORE_BLOCKLIST = new Set([
    "__identifierCaseProjectIndex",
    "__identifierCaseRenameMap",
    "__identifierCasePlanSnapshot"
]);

function trimOptionStoreMap(
    maxEntries = getDefaultIdentifierCaseOptionStoreMaxEntries()
) {
    if (!Number.isFinite(maxEntries)) {
        return;
    }

    const limit = Math.floor(maxEntries);
    if (limit <= 0 || optionStoreMap.size <= limit) {
        return;
    }

    while (optionStoreMap.size > limit) {
        const { value, done } = optionStoreMap.keys().next();
        if (done) {
            break;
        }

        optionStoreMap.delete(value);
    }
}

/**
 * Resolve the maximum number of cached option-store entries that should be
 * retained for the provided options bag. The identifier-case tooling allows an
 * explicit `Infinity` override so long-running editors can opt out of cache
 * eviction, but otherwise normalizes any user-supplied value to a non-negative
 * integer so the trimming logic never sees `NaN`, negative values, or
 * fractional counts.
 *
 * @param {unknown} options A consumer-supplied options object that may embed
 * the option-store max-entries override.
 * @returns {number} The normalized entry limit, defaulting to the shared
 * baseline when the caller omits or misconfigures the override.
 */
function resolveMaxOptionStoreEntries(options) {
    if (!isObjectLike(options)) {
        return getDefaultIdentifierCaseOptionStoreMaxEntries();
    }

    const configured =
        options[IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME];

    if (configured === Infinity) {
        return configured;
    }

    if (!isFiniteNumber(configured)) {
        return getDefaultIdentifierCaseOptionStoreMaxEntries();
    }

    if (configured <= 0) {
        return 0;
    }

    return Math.floor(configured);
}

function getStoreKey(options) {
    if (!isObjectLike(options)) {
        return null;
    }

    if (options.__identifierCaseOptionsStoreKey != undefined) {
        return options.__identifierCaseOptionsStoreKey;
    }

    if (isNonEmptyString(options.filepath)) {
        return options.filepath;
    }

    return null;
}

function getOrCreateStoreEntry(storeKey) {
    const existed = optionStoreMap.has(storeKey);
    const entry = getOrCreateMapEntry(optionStoreMap, storeKey, () => ({}));

    if (existed) {
        optionStoreMap.delete(storeKey);
        optionStoreMap.set(storeKey, entry);
    }

    return entry;
}

function updateStore(options, key, value) {
    if (!isObjectLike(options)) {
        return;
    }

    const store = options.__identifierCaseOptionsStore;
    if (isObjectLike(store)) {
        store[key] = value;
    }

    const storeKey = getStoreKey(options);
    if (storeKey == undefined) {
        return;
    }

    if (STORE_BLOCKLIST.has(key)) {
        return;
    }

    const entry = getOrCreateStoreEntry(storeKey);
    entry[key] = value;
    trimOptionStoreMap(resolveMaxOptionStoreEntries(options));
}

function deleteFromStore(storeKey, key) {
    if (storeKey == undefined) {
        return;
    }

    const entry = optionStoreMap.get(storeKey);
    if (!entry || !Object.hasOwn(entry, key)) {
        return;
    }

    delete entry[key];

    if (Object.keys(entry).length === 0) {
        optionStoreMap.delete(storeKey);
    }
}

export function setIdentifierCaseOption(options, key, value) {
    if (!isObjectLike(options)) {
        return;
    }

    options[key] = value;
    updateStore(options, key, value);
}

export function deleteIdentifierCaseOption(options, key) {
    if (!isObjectLike(options) || key == undefined) {
        return;
    }

    if (Object.hasOwn(options, key)) {
        try {
            delete options[key];
        } catch {
            options[key] = undefined;
        }
    }

    const storeKey = getStoreKey(options);
    deleteFromStore(storeKey, key);
}

export function getIdentifierCaseOptionStore(storeKey) {
    if (storeKey == undefined) {
        return null;
    }

    return optionStoreMap.get(storeKey) ?? null;
}

export function clearIdentifierCaseOptionStore(storeKey) {
    if (storeKey == undefined) {
        optionStoreMap.clear();
        return;
    }

    optionStoreMap.delete(storeKey);
}

export {
    applyIdentifierCaseOptionStoreEnvOverride,
    getDefaultIdentifierCaseOptionStoreMaxEntries,
    setDefaultIdentifierCaseOptionStoreMaxEntries
} from "./option-store-defaults.js";

export {
    DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES as DEFAULT_MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES,
    DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES as MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES,
    IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_BASELINE,
    IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_ENV_VAR
} from "./option-store-defaults.js";
