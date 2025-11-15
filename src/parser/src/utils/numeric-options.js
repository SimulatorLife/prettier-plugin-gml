// Forward numeric option helpers to @gml-modules/core so there is a single
// source of truth for validation and normalization.
export {
    coercePositiveInteger,
    coerceNonNegativeInteger,
    coercePositiveIntegerOption,
    resolveIntegerOption,
    normalizeNumericOption,
    createNumericTypeErrorFormatter
} from "@gml-modules/core";
