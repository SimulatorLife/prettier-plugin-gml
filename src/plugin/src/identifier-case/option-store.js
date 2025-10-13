const optionStoreMap = new Map();

function getStoreKey(options) {
    if (!options || typeof options !== "object") {
        return null;
    }

    if (options.__identifierCaseOptionsStoreKey != null) {
        return options.__identifierCaseOptionsStoreKey;
    }

    if (typeof options.filepath === "string" && options.filepath.length > 0) {
        return options.filepath;
    }

    return null;
}

function updateStore(options, key, value) {
    const store = options.__identifierCaseOptionsStore;
    if (store && typeof store === "object") {
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
    if (!options || typeof options !== "object") {
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
