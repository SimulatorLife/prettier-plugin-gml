/**
 * String literals recognised by the object wrap option helpers.
 */
type ObjectWrapOptionValue = "preserve" | "collapse";

type ObjectWrapOptionBag = Readonly<{
    objectWrap?: ObjectWrapOptionValue;
}>;

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
 * @param {ObjectWrapOptionBag | null | undefined} options
 * @returns {ObjectWrapOptionValue}
 */
function resolveObjectWrapOption(options?: ObjectWrapOptionBag | null): ObjectWrapOptionValue {
    return options?.objectWrap === ObjectWrapOption.COLLAPSE ? ObjectWrapOption.COLLAPSE : ObjectWrapOption.PRESERVE;
}

export { ObjectWrapOption, resolveObjectWrapOption };
