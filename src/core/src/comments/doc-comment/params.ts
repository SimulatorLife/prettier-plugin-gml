import { defaultDocCommentStringCoercions, type DocCommentStringCoercions } from "./string-coercions.js";

const STRING_TYPE = "string";

export function normalizeOptionalParamToken(token: unknown) {
    if (typeof token !== STRING_TYPE) {
        return token;
    }

    const stringToken = token as string;
    const trimmed = stringToken.trim();

    if (/^\[[^\]]+\]$/.test(trimmed)) {
        return trimmed;
    }

    const stripped = trimmed.replaceAll(/^\*+|\*+$/g, "");

    if (stripped === trimmed) {
        return trimmed;
    }

    const normalized = stripped.trim();

    if (normalized.length === 0) {
        return stripped.replaceAll("*", "");
    }

    return `[${normalized}]`;
}

export function stripSyntheticParameterSentinels(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return name;
    }

    let sanitized = name as string;
    sanitized = sanitized.replace(/^[_$]+/, "");
    sanitized = sanitized.replace(/[_$]+$/, "");

    return sanitized.length > 0 ? sanitized : name;
}

export function normalizeDocMetadataName(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return name;
    }

    const optionalNormalized = normalizeOptionalParamToken(name);
    if (typeof optionalNormalized === STRING_TYPE) {
        const normalizedString = optionalNormalized as string;
        if (/^\[[^\]]+\]$/.test(normalizedString)) {
            return normalizedString;
        }

        const sanitized = stripSyntheticParameterSentinels(normalizedString);
        return (sanitized as string).length > 0 ? sanitized : normalizedString;
    }

    return name;
}

export function getCanonicalParamNameFromText(name: unknown): string | null {
    if (typeof name !== STRING_TYPE) {
        return null;
    }

    let trimmed = (name as string).trim();

    if (trimmed.startsWith("[")) {
        let depth = 0;
        let closingIndex = -1;

        let index = 0;
        for (const char of trimmed) {
            if (char === "[") {
                depth += 1;
            } else if (char === "]") {
                depth -= 1;
                if (depth === 0) {
                    closingIndex = index;
                    break;
                }
            }

            index += 1;
        }

        if (closingIndex > 0) {
            trimmed = trimmed.slice(1, closingIndex);
        }
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex !== -1) {
        trimmed = trimmed.slice(0, equalsIndex);
    }

    const normalized = normalizeDocMetadataName(trimmed.trim());
    if (typeof normalized !== STRING_TYPE) {
        return null;
    }

    const normalizedString = (normalized as string).trim();
    return normalizedString.length > 0 ? normalizedString : null;
}

export function docParamNamesLooselyEqual(left: unknown, right: unknown) {
    if (typeof left !== STRING_TYPE || typeof right !== STRING_TYPE) {
        return false;
    }

    const toComparable = (value: unknown) => {
        const normalized = normalizeDocMetadataName(value);
        if (typeof normalized !== STRING_TYPE) {
            return null;
        }

        let trimmed = (normalized as string).trim();
        if (trimmed.length === 0) {
            return null;
        }

        if (trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.length > 2) {
            trimmed = trimmed.slice(1, -1).trim();
        }

        return trimmed.toLowerCase();
    };

    const leftComp = toComparable(left);
    const rightComp = toComparable(right);

    return leftComp !== null && rightComp !== null && leftComp === rightComp;
}

export function isOptionalParamDocName(name: unknown) {
    if (typeof name !== STRING_TYPE) {
        return false;
    }
    const trimmed = (name as string).trim();
    return trimmed.startsWith("[") && trimmed.endsWith("]");
}

export function normalizeParamDocType(
    typeText: string,
    coercions: DocCommentStringCoercions = defaultDocCommentStringCoercions
) {
    return coercions.coerceNonEmptyString(typeText);
}

export const preservedUndefinedDefaultParameters = new WeakSet<any>();
export const synthesizedUndefinedDefaultParameters = new WeakSet<any>();
