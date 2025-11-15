// Keep the parser's historical object helper entry point but delegate to the
// authoritative @gml-modules-core implementations.
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
} from "@gml-modules/core";
