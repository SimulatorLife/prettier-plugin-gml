// Forward numeric option helpers to @gml-modules/core so there is a single
// source of truth for validation and normalization.
import { Core } from "@gml-modules/core";
const { coercePositiveInteger, coerceNonNegativeInteger, coercePositiveIntegerOption, resolveIntegerOption, normalizeNumericOption, createNumericTypeErrorFormatter } = Core;
export { coercePositiveInteger, coerceNonNegativeInteger, coercePositiveIntegerOption, resolveIntegerOption, normalizeNumericOption, createNumericTypeErrorFormatter };

