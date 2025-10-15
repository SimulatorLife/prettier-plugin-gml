import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isObjectLike, withObjectLike } from "../../../shared/object-utils.js";

const optionStoreMap = new Map();
const MAX_OPTION_STORE_ENTRIES = 128;

function trimOptionStoreMap() {
    while (optionStoreMap.size > MAX_OPTION_STORE_ENTRIES) {
        const oldestEntry = optionStoreMap.keys().next();
        if (oldestEntry.done) {
            break;
        }
        optionStoreMap.delete(oldestEntry.value);
    }
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
            trimOptionStoreMap();
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

export const MAX_IDENTIFIER_CASE_OPTION_STORE_ENTRIES =
    MAX_OPTION_STORE_ENTRIES;
