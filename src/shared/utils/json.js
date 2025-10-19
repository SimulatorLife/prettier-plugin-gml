import { isNonEmptyString, toTrimmedString } from "./string.js";
import { isErrorLike } from "./capability-probes.js";

function getErrorMessage(value) {
    if (typeof value === "string") {
        return value;
    }

    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value.toString !== "function") {
        return null;
    }

    try {
        return value.toString();
    } catch {
        return null;
    }
}

function toError(value) {
    if (isErrorLike(value)) {
        return value;
    }

    const rawMessage = getErrorMessage(value);
    const message =
        rawMessage && rawMessage !== "[object Object]"
            ? rawMessage
            : "Unknown error";

    const fallback = new Error(message);
    fallback.name = "NonErrorThrown";
    return fallback;
}

/**
 * Specialized syntax error raised when JSON parsing fails. The wrapper keeps
 * the original `cause` intact (when supported) while also carrying extra
 * metadata about the source being parsed so callers can produce actionable
 * error messages without re-threading context through every call site.
 */
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
    if (source == undefined) {
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

/**
 * Parse a JSON payload while annotating any failures with high-level context.
 *
 * The helper mirrors `JSON.parse` semantics but decorates thrown errors with
 * {@link JsonParseError}, ensuring the resulting message includes the
 * normalized description/source and the original failure details. This keeps
 * diagnostics stable even when upstream code throws non-`Error` values or
 * provides blank description strings.
 *
 * @param {string} text Raw JSON text to parse.
 * @param {{
 *     source?: string | unknown,
 *     description?: string | unknown,
 *     reviver?: (this: any, key: string, value: any) => any
 * }} [options] Parsing options. `source` is surfaced in error messages to
 *     highlight where the JSON originated. `description` labels the payload
 *     (defaults to "JSON"), and `reviver` mirrors the native `JSON.parse`
 *     reviver hook.
 * @returns {any} Parsed JavaScript value when `text` is valid JSON.
 * @throws {JsonParseError} When parsing fails. The error exposes `cause`,
 *     `source`, and `description` properties when available.
 */
export function parseJsonWithContext(text, options = {}) {
    const { source, description, reviver } = options;
    try {
        return JSON.parse(text, reviver);
    } catch (error) {
        const cause = toError(error);
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
