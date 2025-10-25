const ObjectWrapOption = Object.freeze({
    PRESERVE: "preserve",
    COLLAPSE: "collapse"
});

const OBJECT_WRAP_VALUES = new Set(Object.values(ObjectWrapOption));

const defaultResolveObjectWrapOption = (options) =>
    options?.objectWrap === ObjectWrapOption.COLLAPSE
        ? ObjectWrapOption.COLLAPSE
        : ObjectWrapOption.PRESERVE;

let objectWrapOptionResolver = null;

function normalizeObjectWrapOption(value) {
    if (!OBJECT_WRAP_VALUES.has(value)) {
        return ObjectWrapOption.PRESERVE;
    }

    return value;
}

function resolveObjectWrapOption(options) {
    if (typeof objectWrapOptionResolver !== "function") {
        return defaultResolveObjectWrapOption(options);
    }

    try {
        const resolved = objectWrapOptionResolver(options);
        return normalizeObjectWrapOption(resolved);
    } catch {
        return defaultResolveObjectWrapOption(options);
    }
}

function setObjectWrapOptionResolver(resolver) {
    if (typeof resolver !== "function") {
        resetObjectWrapOptionResolver();
        return () => {};
    }

    const previousResolver = objectWrapOptionResolver;

    objectWrapOptionResolver = resolver;

    return () => {
        if (objectWrapOptionResolver === resolver) {
            objectWrapOptionResolver = previousResolver;
        }
    };
}

function resetObjectWrapOptionResolver() {
    objectWrapOptionResolver = null;
}

export {
    ObjectWrapOption,
    resolveObjectWrapOption,
    resetObjectWrapOptionResolver,
    setObjectWrapOptionResolver
};
