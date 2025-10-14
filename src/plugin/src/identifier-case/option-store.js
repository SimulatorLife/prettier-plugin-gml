import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isObjectLike, withObjectLike } from "../../../shared/object-utils.js";

const optionStoreMap = new Map();

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
            const existing = optionStoreMap.get(storeKey) ?? {};
            existing[key] = value;
            optionStoreMap.set(storeKey, existing);
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
