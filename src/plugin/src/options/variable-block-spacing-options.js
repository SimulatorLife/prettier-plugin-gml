import { coercePositiveIntegerOption, isObjectLike } from "../shared/index.js";

const DEFAULT_MIN_DECLARATION_RUN_LENGTH = 4;
const VARIABLE_BLOCK_SPACING_DISABLED_VALUE = Number.POSITIVE_INFINITY;
const VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS_OPTION =
    "variableBlockSpacingMinDeclarations";

function resolveVariableBlockSpacingMinDeclarations(options) {
    if (!isObjectLike(options)) {
        return DEFAULT_MIN_DECLARATION_RUN_LENGTH;
    }

    return coercePositiveIntegerOption(
        options[VARIABLE_BLOCK_SPACING_MIN_DECLARATIONS_OPTION],
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
