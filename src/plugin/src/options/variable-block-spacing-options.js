import {
    coalesceOption,
    coercePositiveIntegerOption
} from "../shared/index.js";

const DEFAULT_MIN_DECLARATION_RUN_LENGTH = 4;
// Represent "disabled" with `Infinity` so callers can compare against a single
// sentinel while still treating the resolved value as numeric configuration.
const VARIABLE_BLOCK_SPACING_DISABLED_VALUE = Number.POSITIVE_INFINITY;
const VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS_OPTION =
    "variableBlockSpacingMinDeclarations";

/**
 * Normalize the minimum run length of `var` declarations that triggers the
 * formatter's blank-line insertion.
 *
 * Accepts the raw plugin `options` bag and falls back to the default when the
 * override is missing or invalid. Explicit `0` values are promoted to
 * {@link VARIABLE_BLOCK_SPACING_DISABLED_VALUE} so the calling logic can share
 * the same comparison branch it uses for positive numbers.
 *
 * @param {unknown} options Candidate plugin options object.
 * @returns {number} Minimum declaration count or the disabled sentinel.
 */
function resolveVariableBlockSpacingMinDeclarations(options) {
    const override = coalesceOption(
        options,
        VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS_OPTION
    );

    return coercePositiveIntegerOption(
        override,
        DEFAULT_MIN_DECLARATION_RUN_LENGTH,
        { zeroReplacement: VARIABLE_BLOCK_SPACING_DISABLED_VALUE }
    );
}

export {
    DEFAULT_MIN_DECLARATION_RUN_LENGTH,
    VARIABLE_BLOCK_SPACING_DISABLED_VALUE,
    VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS_OPTION,
    resolveVariableBlockSpacingMinDeclarations
};
