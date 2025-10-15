import { isNonEmptyString, toTrimmedString } from "./string-utils.js";

function toError(value) {
    if (value instanceof Error) {
        return value;
    }

    let message;
    try {
        if (typeof value === "string") {
            message = value;
        } else if (value != null && typeof value.toString === "function") {
            message = value.toString();
        }
    } catch {
        // Ignore toString failures and fall back to a generic description below.
    }

    if (!message || message === "[object Object]") {
        message = "Unknown error";
    }

    const fallback = new Error(message);
    fallback.name = "NonErrorThrown";
    return fallback;
}

export class JsonParseError extends SyntaxError {
    constructor(message, { cause, source, description } = {}) {
        super(message, cause ? { cause } : undefined);
        this.name = "JsonParseError";
        if (source !== undefined) {
            this.source = source;
        }
        if (description !== undefined) {
            this.description = description;
        }
    }
}

function normalizeDescription(description) {
    const normalized = toTrimmedString(description);

    return normalized.length > 0 ? normalized : "JSON";
}

function normalizeSource(source) {
    if (source == null) {
        return null;
    }
    if (isNonEmptyString(source)) {
        return source;
    }
    try {
        return String(source);
    } catch {
        return "";
    }
}

function extractErrorDetails(error) {
    const normalized = toTrimmedString(error?.message);

    return normalized.length > 0 ? normalized : "Unknown error";
}

export function parseJsonWithContext(text, options = {}) {
    const { source, description, reviver } = options;
    try {
        return JSON.parse(text, reviver);
    } catch (thrown) {
        const cause = toError(thrown);
        const normalizedDescription = normalizeDescription(description);
        const normalizedSource = normalizeSource(source);
        const details = extractErrorDetails(cause);
        const locationSuffix = normalizedSource
            ? ` from ${normalizedSource}`
            : "";
        const message = `Failed to parse ${normalizedDescription}${locationSuffix}: ${details}`;
        throw new JsonParseError(message, {
            cause,
            source: normalizedSource ?? undefined,
            description: normalizedDescription
        });
    }
}
