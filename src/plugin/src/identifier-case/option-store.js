import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import {
    DEFAULT_IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES,
    IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME
} from "../options/identifier-case.js";

const optionStoreMap = new Map();
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

    while (optionStoreMap.size > limit) {
        const oldestEntry = optionStoreMap.keys().next();
        if (oldestEntry.done) {
            break;
        }
        optionStoreMap.delete(oldestEntry.value);
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

    if (typeof configured === "number" && Number.isFinite(configured)) {
        if (configured <= 0) {
            return 0;
        }

        return Math.floor(configured);
    }

    return DEFAULT_MAX_OPTION_STORE_ENTRIES;
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

function updateStore(options, key, value) {
    const store = options.__identifierCaseOptionsStore;
    if (isObjectLike(store)) {
        store[key] = value;
    }

    const storeKey = getStoreKey(options);
    if (storeKey == undefined) {
        return;
    }

    const entry = optionStoreMap.get(storeKey) ?? {};
    entry[key] = value;

    if (optionStoreMap.has(storeKey)) {
        optionStoreMap.delete(storeKey);
    }

    optionStoreMap.set(storeKey, entry);
    trimOptionStoreMap(resolveMaxOptionStoreEntries(options));
}

export function setIdentifierCaseOption(options, key, value) {
    if (!isObjectLike(options)) {
        return;
    }

    options[key] = value;
    updateStore(options, key, value);
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
