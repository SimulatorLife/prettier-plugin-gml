// Keep the parser's historical object helper entry point but delegate to the
// authoritative @gml-modules-core implementations.
import { Core } from "@gml-modules/core";
const {
    Utils: {
        isPlainObject,
        assertFunction,
        isObjectLike,
        resolveHelperOverride,
        describeValueWithArticle,
        isObjectOrFunction,
        assertFunctionProperties,
        getObjectTagName,
        assertPlainObject,
        withObjectLike,
        coalesceOption,
        hasOwn,
        getOrCreateMapEntry,
        incrementMapValue
    }
} = Core;
export {
    isPlainObject,
    assertFunction,
    isObjectLike,
    resolveHelperOverride,
    describeValueWithArticle,
    isObjectOrFunction,
    assertFunctionProperties,
    getObjectTagName,
    assertPlainObject,
    withObjectLike,
    coalesceOption,
    hasOwn,
    getOrCreateMapEntry,
    incrementMapValue
};
