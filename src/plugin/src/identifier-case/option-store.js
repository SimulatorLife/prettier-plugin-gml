import { isNonEmptyString } from "../shared/string-utils.js";
import { getOrCreateMapEntry, isObjectLike } from "../shared/object-utils.js";
import {
    DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES,
    IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME
} from "../options/identifier-case.js";

const optionStoreMap = new Map();
const STORE_BLACKLIST = new Set([
    "__identifierCaseProjectIndex",
    "__identifierCaseRenameMap",
    "__identifierCasePlanSnapshot"
]);
const DEFAULT_MAX_OPTION_STORE_ENTRIES =
    DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES;

function trimOptionStoreMap(maxEntries = DEFAULT_MAX_OPTION_STORE_ENTRIES) {
    if (!Number.isFinite(maxEntries)) {
        return;
    }

    const limit = Math.floor(maxEntries);
    if (limit <= 0) {
        return;
    }

    let excessEntries = optionStoreMap.size - limit;
    if (excessEntries <= 0) {
        return;
    }

    for (const key of optionStoreMap.keys()) {
        if (excessEntries <= 0) {
            break;
        }

        optionStoreMap.delete(key);
        excessEntries -= 1;
    }
}

function resolveMaxOptionStoreEntries(options) {
    if (!isObjectLike(options)) {
        return DEFAULT_MAX_OPTION_STORE_ENTRIES;
    }

    const configured =
        options[IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME];

    if (configured === Infinity) {
        return configured;
    }

    if (typeof configured !== "number" || !Number.isFinite(configured)) {
        return DEFAULT_MAX_OPTION_STORE_ENTRIES;
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

    if (STORE_BLACKLIST.has(key)) {
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

export const DEFAULT_MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES =
    DEFAULT_MAX_OPTION_STORE_ENTRIES;
export const MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES =
    DEFAULT_MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES;
