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

/**
 * Determine the active wrap preference by consulting Prettier's
 * configuration.
 *
 * @param {unknown} options
 * @returns {ObjectWrapOptionValue}
 */
function resolveObjectWrapOption(options) {
    return options?.objectWrap === ObjectWrapOption.COLLAPSE
        ? ObjectWrapOption.COLLAPSE
        : ObjectWrapOption.PRESERVE;
}

export { ObjectWrapOption, resolveObjectWrapOption };
