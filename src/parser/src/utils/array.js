// Thin re-export of the canonical array helpers that live in the core package
// during the migration. Keeping a parser-local module maintains the historical
// import path used by many parser modules while centralizing the implementation
// in `src/core`.

// Expose the canonical array helpers from the `@gml-modules/core` package.
// Parser code should import these helpers from the package namespace so the
// implementation lives only in `src/core` and there are no fragile relative
// cross-package paths.
import { Core } from "@gml-modules/core";

const {
    Utils: {
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
    }
} = Core;
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
};
