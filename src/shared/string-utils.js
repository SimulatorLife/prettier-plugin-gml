export function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}

// Fast path the most common whitespace checks (`space`, `tab`, newline family)
// before falling back to a switch covering the remaining code points trimmed
// by `String.prototype.trim`. This keeps the branch predictability high for
// everyday ASCII input while preserving correctness for the full ECMAScript
// whitespace set.
function isTrimmedWhitespaceCharCode(charCode) {
    if (charCode <= 0x20) {
        return (
            charCode === 0x20 ||
            charCode === 0x09 ||
            charCode === 0x0a ||
            charCode === 0x0b ||
            charCode === 0x0c ||
            charCode === 0x0d
        );
    }

    switch (charCode) {
        case 0x00_a0:
        case 0x16_80:
        case 0x20_00:
        case 0x20_01:
        case 0x20_02:
        case 0x20_03:
        case 0x20_04:
        case 0x20_05:
        case 0x20_06:
        case 0x20_07:
        case 0x20_08:
        case 0x20_09:
        case 0x20_0a:
        case 0x20_28:
        case 0x20_29:
        case 0x20_2f:
        case 0x20_5f:
        case 0x30_00:
        case 0xfe_ff: {
            return true;
        }
        default: {
            return false;
        }
    }
}

export function isNonEmptyTrimmedString(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }

    for (let index = 0; index < value.length; index += 1) {
        if (!isTrimmedWhitespaceCharCode(value.charCodeAt(index))) {
            return true;
        }
    }

    return false;
}

export function getNonEmptyString(value) {
    return isNonEmptyString(value) ? value : null;
}

// Hoist frequently accessed character code constants so `isWordChar` can avoid
// constructing a `RegExp` for every call while still remaining easy to read.
const CHAR_CODE_UPPER_A = "A".charCodeAt(0);
const CHAR_CODE_UPPER_Z = "Z".charCodeAt(0);
const CHAR_CODE_LOWER_A = "a".charCodeAt(0);
const CHAR_CODE_LOWER_Z = "z".charCodeAt(0);
const CHAR_CODE_DIGIT_0 = "0".charCodeAt(0);
const CHAR_CODE_DIGIT_9 = "9".charCodeAt(0);
const CHAR_CODE_UNDERSCORE = "_".charCodeAt(0);

export function isWordChar(character) {
    if (typeof character !== "string" || character.length === 0) {
        return false;
    }

    for (let index = 0; index < character.length; index += 1) {
        const charCode = character.charCodeAt(index);

        if (
            (charCode >= CHAR_CODE_UPPER_A && charCode <= CHAR_CODE_UPPER_Z) ||
            (charCode >= CHAR_CODE_LOWER_A && charCode <= CHAR_CODE_LOWER_Z) ||
            (charCode >= CHAR_CODE_DIGIT_0 && charCode <= CHAR_CODE_DIGIT_9) ||
            charCode === CHAR_CODE_UNDERSCORE
        ) {
            return true;
        }
    }

    return false;
}

export function toTrimmedString(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function toNormalizedLowerCaseString(value) {
    if (value == undefined) {
        return "";
    }

    return String(value).trim().toLowerCase();
}

export function capitalize(value) {
    if (!isNonEmptyString(value)) {
        return value;
    }

    return value.at(0).toUpperCase() + value.slice(1);
}

const DEFAULT_STRING_LIST_SPLIT_PATTERN = /[\n,]/;

function normalizeEntries(entries) {
    const seen = new Set();

    for (const entry of entries) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();
        if (trimmed.length === 0) {
            continue;
        }

        seen.add(trimmed);
    }

    return [...seen];
}

export function normalizeStringList(
    value,
    {
        splitPattern = DEFAULT_STRING_LIST_SPLIT_PATTERN,
        allowInvalidType = false,
        errorMessage = "Value must be provided as a string or array of strings."
    } = {}
) {
    if (value == undefined) {
        return [];
    }

    if (Array.isArray(value)) {
        return normalizeEntries(value);
    }

    if (typeof value === "string") {
        const pattern = splitPattern ?? DEFAULT_STRING_LIST_SPLIT_PATTERN;
        const entries = pattern ? value.split(pattern) : [value];
        return normalizeEntries(entries);
    }

    if (allowInvalidType) {
        return [];
    }

    throw new TypeError(errorMessage);
}

export function toNormalizedLowerCaseSet(
    value,
    { splitPattern = null, allowInvalidType = true, errorMessage } = {}
) {
    const normalizedValues = normalizeStringList(value, {
        splitPattern,
        allowInvalidType,
        errorMessage
    });

    const result = new Set();

    for (const entry of normalizedValues) {
        result.add(entry.toLowerCase());
    }

    return result;
}
