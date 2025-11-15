// Thin re-export of the canonical array helpers that live in the core package
// during the migration. Keeping a parser-local module maintains the historical
// import path used by many parser modules while centralizing the implementation
// in `src/core`.

export * from "../../../core/src/utils/array.js";
// Delegate to the canonical array utilities housed in @gml-modules/core so we
// avoid maintaining duplicate implementations inside the parser package.
// TODO: Refactor to directly use the @gml-modules/core package wherever needed and remove this file.
export {
    toArrayFromIterable,
    toArray,
    assertArray,
    asArray,
    toMutableArray,
    isNonEmptyArray,
    isArrayIndex,
    uniqueArray,
    compactArray,
    pushUnique,
    mergeUniqueValues,
    appendToCollection
} from "@gml-modules/core";
