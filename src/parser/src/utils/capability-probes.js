// Delegate capability probes to @gml-modules/core to avoid diverging logic
// between packages.
export {
    hasFunction,
    isErrorLike,
    isAggregateErrorLike,
    isRegExpLike,
    isMapLike,
    isSetLike,
    hasIterableItems,
    getIterableSize,
    ensureSet,
    ensureMap
} from "@gml-modules/core";
