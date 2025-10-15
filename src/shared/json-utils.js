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

function normaliseDescription(description) {
    if (typeof description === "string" && description.trim().length > 0) {
        return description.trim();
    }
    return "JSON";
}

function normaliseSource(source) {
    if (source == null) {
        return null;
    }
    if (typeof source === "string" && source.length > 0) {
        return source;
    }
    try {
        return String(source);
    } catch {
        return "";
    }
}

function extractErrorDetails(error) {
    const { message } = error ?? {};
    if (typeof message === "string" && message.trim().length > 0) {
        return message.trim();
    }
    return "Unknown error";
}

export function parseJsonWithContext(text, options = {}) {
    const { source, description, reviver } = options;
    try {
        return JSON.parse(text, reviver);
    } catch (thrown) {
        const cause = toError(thrown);
        const normalisedDescription = normaliseDescription(description);
        const normalisedSource = normaliseSource(source);
        const details = extractErrorDetails(cause);
        const locationSuffix = normalisedSource
            ? ` from ${normalisedSource}`
            : "";
        const message = `Failed to parse ${normalisedDescription}${locationSuffix}: ${details}`;
        throw new JsonParseError(message, {
            cause,
            source: normalisedSource ?? undefined,
            description: normalisedDescription
        });
    }
}
