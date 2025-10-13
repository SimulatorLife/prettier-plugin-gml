import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isObjectLike } from "../../../shared/object-utils.js";

const optionStoreMap = new Map();

function getStoreKey(options) {
    if (!isObjectLike(options)) {
        return null;
    }

    if (options.__identifierCaseOptionsStoreKey != null) {
        return options.__identifierCaseOptionsStoreKey;
    }

    if (isNonEmptyString(options.filepath)) {
        return options.filepath;
    }

    return null;
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
    if (storeKey != null) {
        const existing = optionStoreMap.get(storeKey) ?? {};
        existing[key] = value;
        optionStoreMap.set(storeKey, existing);
    }
}

export function setIdentifierCaseOption(options, key, value) {
    if (!isObjectLike(options)) {
        return;
    }

    options[key] = value;
    updateStore(options, key, value);
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
