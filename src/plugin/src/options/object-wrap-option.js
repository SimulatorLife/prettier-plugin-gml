/**
 * Canonical object wrap behaviours supported by the formatter.
 *
 * @readonly
 * @enum {"preserve" | "collapse"}
 */
const ObjectWrapOption = Object.freeze({
    PRESERVE: "preserve",
    COLLAPSE: "collapse"
});

/** @type {ReadonlySet<string>} */
const OBJECT_WRAP_VALUES = new Set(Object.values(ObjectWrapOption));

/**
 * Normalize ad-hoc resolvers to the default behaviour when they return an
 * unexpected value.
 *
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalizeObjectWrapOption(value) {
    return OBJECT_WRAP_VALUES.has(value) ? value : ObjectWrapOption.PRESERVE;
}

/**
 * Resolve the default wrap preference directly from the formatter options.
 *
 * @param {unknown} options
 * @returns {string}
 */
function defaultResolveObjectWrapOption(options) {
    return options?.objectWrap === ObjectWrapOption.COLLAPSE
        ? ObjectWrapOption.COLLAPSE
        : ObjectWrapOption.PRESERVE;
}

/** @type {((options: unknown) => string) | null} */
let objectWrapOptionResolver = null;

/**
 * Determine the active wrap preference by consulting any caller supplied
 * resolver first.
 *
 * @param {unknown} options
 * @returns {string}
 */
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

/**
 * Register a resolver used to override how object wrap preferences are
 * derived. Returns a disposer that restores the previous resolver.
 *
 * @param {unknown} resolver
 * @returns {() => void}
 */
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

/**
 * Restore the default object wrap resolver behaviour.
 */
function resetObjectWrapOptionResolver() {
    objectWrapOptionResolver = null;
}

export {
    ObjectWrapOption,
    resolveObjectWrapOption,
    resetObjectWrapOptionResolver,
    setObjectWrapOptionResolver
};
