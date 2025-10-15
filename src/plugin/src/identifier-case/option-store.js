import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isObjectLike, withObjectLike } from "../../../shared/object-utils.js";
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
    return withObjectLike(
        options,
        (object) => {
            if (object.__identifierCaseOptionsStoreKey != null) {
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

function updateStore(options, key, value) {
    withObjectLike(options, (object) => {
        const store = object.__identifierCaseOptionsStore;
        if (isObjectLike(store)) {
            store[key] = value;
        }

        const storeKey = getStoreKey(object);
        if (storeKey != null) {
            let existing = optionStoreMap.get(storeKey);
            if (!existing) {
                existing = {};
            }

            existing[key] = value;

            if (optionStoreMap.has(storeKey)) {
                optionStoreMap.delete(storeKey);
            }

            optionStoreMap.set(storeKey, existing);
            trimOptionStoreMap(resolveMaxOptionStoreEntries(object));
        }
    });
}

export function setIdentifierCaseOption(options, key, value) {
    withObjectLike(options, (object) => {
        object[key] = value;
        updateStore(object, key, value);
    });
}

export function getIdentifierCaseOptionStore(storeKey) {
    if (storeKey == null) {
        return null;
    }

    return optionStoreMap.get(storeKey) ?? null;
}

export function clearIdentifierCaseOptionStore(storeKey) {
    if (storeKey == null) {
        optionStoreMap.clear();
        return;
    }

    optionStoreMap.delete(storeKey);
}

export const DEFAULT_MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES =
    DEFAULT_MAX_OPTION_STORE_ENTRIES;
export const MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES =
    DEFAULT_MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES;
