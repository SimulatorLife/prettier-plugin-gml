/**
 * Re-export runtime helpers from `@gml-modules/core` to maintain a stable
 * import surface for runtime-wrapper consumers. This file previously duplicated
 * core utilities to avoid workspace dependencies, but runtime-wrapper already
 * depends on @gml-modules/core in package.json, making the duplication unnecessary.
 */
import { Core } from "@gml-modules/core";

export const toArray = Core.toArray;
export const isNonEmptyString = Core.isNonEmptyString;
export const areNumbersApproximatelyEqual = Core.areNumbersApproximatelyEqual;
export const isErrorLike = Core.isErrorLike;
export const cloneObjectEntries = Core.cloneObjectEntries;
