/**
 * String literals recognised by the object wrap option helpers.
 *
 * @typedef {"preserve" | "collapse"} ObjectWrapOptionValue
 */

/**
 * Canonical object wrap behaviours supported by the formatter.
 *
 * @readonly
 * @enum {ObjectWrapOptionValue}
 */
const ObjectWrapOption = Object.freeze({
    PRESERVE: "preserve",
    COLLAPSE: "collapse"
});

/** @type {ReadonlySet<ObjectWrapOptionValue>} */
const OBJECT_WRAP_VALUES = new Set(Object.values(ObjectWrapOption));

const NOOP_DISPOSE = () => {};

/**
 * Normalize ad-hoc resolvers to the default behaviour when they return an
 * unexpected value.
 *
 * @param {ObjectWrapOptionValue | null | undefined} value
 * @returns {ObjectWrapOptionValue}
 */
function normalizeObjectWrapOption(value) {
    return OBJECT_WRAP_VALUES.has(value) ? value : ObjectWrapOption.PRESERVE;
}

/**
 * Resolve the default wrap preference directly from the formatter options.
 *
 * @param {unknown} options
 * @returns {ObjectWrapOptionValue}
 */
function defaultResolveObjectWrapOption(options) {
    return options?.objectWrap === ObjectWrapOption.COLLAPSE
        ? ObjectWrapOption.COLLAPSE
        : ObjectWrapOption.PRESERVE;
}

/** @type {((options: unknown) => ObjectWrapOptionValue) | null} */
let objectWrapOptionResolver = null;

/**
 * Determine the active wrap preference by consulting any caller supplied
 * resolver first.
 *
 * @param {unknown} options
 * @returns {ObjectWrapOptionValue}
 */
function resolveObjectWrapOption(options) {
    if (typeof objectWrapOptionResolver !== "function") {
        return defaultResolveObjectWrapOption(options);
    }

    try {
        return normalizeObjectWrapOption(objectWrapOptionResolver(options));
    } catch {
        return defaultResolveObjectWrapOption(options);
    }
}

/**
 * Register a resolver used to override how object wrap preferences are
 * derived. Returns a disposer that restores the previous resolver.
 *
 * @param {((options: unknown) => ObjectWrapOptionValue) | null | undefined} resolver
 * @returns {() => void}
 */
function setObjectWrapOptionResolver(resolver) {
    if (typeof resolver !== "function") {
        resetObjectWrapOptionResolver();
        return NOOP_DISPOSE;
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
