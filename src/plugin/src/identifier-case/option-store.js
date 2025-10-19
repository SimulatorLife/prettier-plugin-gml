import { isNonEmptyString } from "../../../shared/string-utils.js";
import {
    getOrCreateMapEntry,
    isObjectLike,
    withObjectLike
} from "../../../shared/object-utils.js";
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
    if (limit <= 0 || optionStoreMap.size <= limit) {
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
    return withObjectLike(
        options,
        (object) => {
            const configured =
                object[IDENTIFIER_CASE_OPTION_STORE_MAX_ENTRIES_OPTION_NAME];

            if (configured === Infinity) {
                return configured;
            }

            if (
                typeof configured !== "number" ||
                !Number.isFinite(configured)
            ) {
                return DEFAULT_MAX_OPTION_STORE_ENTRIES;
            }

            if (configured <= 0) {
                return 0;
            }

            return Math.floor(configured);
        },
        DEFAULT_MAX_OPTION_STORE_ENTRIES
    );
}

function getStoreKey(options) {
    return withObjectLike(
        options,
        (object) => {
            if (object.__identifierCaseOptionsStoreKey != undefined) {
                return object.__identifierCaseOptionsStoreKey;
            }

            if (isNonEmptyString(object.filepath)) {
                return object.filepath;
            }

            return null;
        },
        null
    );
}

function getOrCreateStoreEntry(storeKey) {
    const entry = getOrCreateMapEntry(optionStoreMap, storeKey, () => ({}));
    optionStoreMap.delete(storeKey);
    optionStoreMap.set(storeKey, entry);
    return entry;
}

function updateStore(options, key, value) {
    withObjectLike(options, (object) => {
        const store = object.__identifierCaseOptionsStore;
        if (isObjectLike(store)) {
            store[key] = value;
        }

        const storeKey = getStoreKey(object);
        if (storeKey == undefined) {
            return;
        }

        const entry = getOrCreateStoreEntry(storeKey);
        entry[key] = value;
        trimOptionStoreMap(resolveMaxOptionStoreEntries(object));
    });
}

export function setIdentifierCaseOption(options, key, value) {
    withObjectLike(options, (object) => {
        object[key] = value;
        updateStore(object, key, value);
    });
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
