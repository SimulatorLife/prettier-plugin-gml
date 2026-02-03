/**
 * Pattern for validating numeric literal strings, including optional sign and exponent parts.
 */
export const NUMERIC_STRING_LITERAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
