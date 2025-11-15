// Delegate capability probes to @gml-modules/core to avoid diverging logic
// between packages.
import { Core } from "@gml-modules/core";
const { hasFunction, isErrorLike, isAggregateErrorLike, isRegExpLike, isMapLike, isSetLike, hasIterableItems, getIterableSize, ensureSet, ensureMap } = Core;
export { hasFunction, isErrorLike, isAggregateErrorLike, isRegExpLike, isMapLike, isSetLike, hasIterableItems, getIterableSize, ensureSet, ensureMap };

