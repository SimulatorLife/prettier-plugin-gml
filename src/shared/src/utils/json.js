import { isErrorLike } from "./capability-probes.js";
import { getErrorMessageOrFallback } from "./error.js";
import { assertPlainObject } from "./object.js";
import { isNonEmptyString, toTrimmedString } from "./string.js";

const JSON_PARSE_ERROR_CAPABILITY = Symbol.for(
    "prettier-plugin-gml.json-parse-error"
);

function hasJsonParseErrorContract(value) {
    if (!isErrorLike(value)) {
        return false;
    }

    if (!isErrorLike(value.cause)) {
        return false;
    }

    const description = toTrimmedString(value.description);
    if (description.length === 0) {
        return false;
    }

    const { source } = value;
    if (source != null && typeof source !== "string") {
        return false;
    }

    return true;
}

function toError(value) {
    if (isErrorLike(value)) {
        return value;
    }

    const message = getErrorMessageOrFallback(value);
    const normalizedMessage =
        message === "[object Object]" ? "Unknown error" : message;

    const fallback = new Error(normalizedMessage);
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

        Object.defineProperty(this, JSON_PARSE_ERROR_CAPABILITY, {
            value: true,
            enumerable: false,
            configurable: true
        });
    }
}

/**
 * Check whether a thrown value matches the {@link JsonParseError} contract.
 *
 * The guard honours the symbol capability applied by {@link JsonParseError}
 * instances so downstream collaborators can opt-in by branding their own
 * facades with {@link Symbol.for "prettier-plugin-gml.json-parse-error"}.
 * When the capability is absent, the function falls back to structural checks
 * that mirror the properties populated by {@link parseJsonWithContext},
 * allowing callers to branch on enriched metadata without relying on
 * constructor names.
 *
 * @param {unknown} value Candidate error object to interrogate.
 * @returns {value is JsonParseError} `true` when the value exposes the
 *     expected shape for {@link JsonParseError}.
 */
export function isJsonParseError(value) {
    if (value?.[JSON_PARSE_ERROR_CAPABILITY]) {
        return true;
    }

    return hasJsonParseErrorContract(value);
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

/**
 * Describe the payload when JSON serialization fails so error messages stay
 * readable without relying on nested ternaries inside the guard clause.
 */
function describePayloadForSerializationError(payload) {
    if (payload === undefined) {
        return "undefined payload";
    }

    const type = typeof payload;

    if (type === "function") {
        return "function payload";
    }

    if (type === "symbol") {
        return "symbol payload";
    }

    return "provided payload";
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

/**
 * Parse a JSON payload that is expected to yield a plain object.
 *
 * The helper reuses {@link parseJsonWithContext} to surface enriched syntax
 * errors and then validates the resulting value with
 * {@link assertPlainObject}. Callers can supply either static assertion
 * options via {@link assertOptions} or compute them dynamically based on the
 * parsed payload via {@link createAssertOptions}. When both are provided, the
 * dynamic options take precedence while still layering on top of the static
 * bag so shared settings like `allowNullPrototype` remain in effect.
 *
 * @param {string} text Raw JSON text to parse.
 * @param {{
 *   source?: string,
 *   description?: string,
 *   reviver?: (this: any, key: string, value: any) => any,
 *   assertOptions?: Parameters<typeof assertPlainObject>[1],
 *   createAssertOptions?: (payload: unknown) => Parameters<typeof assertPlainObject>[1]
 * }} [options]
 * @returns {Record<string, unknown>} Parsed JSON object.
 */
export function parseJsonObjectWithContext(text, options = {}) {
    const { source, description, reviver, assertOptions, createAssertOptions } =
        options;

    const payload = parseJsonWithContext(text, {
        source,
        description,
        reviver
    });

    const baseOptions =
        assertOptions && typeof assertOptions === "object"
            ? assertOptions
            : undefined;

    let dynamicOptions;
    if (typeof createAssertOptions === "function") {
        const resolved = createAssertOptions(payload);
        if (resolved && typeof resolved === "object") {
            dynamicOptions = resolved;
        }
    }

    let mergedOptions;
    if (baseOptions || dynamicOptions) {
        mergedOptions = {
            ...(baseOptions === undefined ? {} : baseOptions),
            ...(dynamicOptions === undefined ? {} : dynamicOptions)
        };
    }

    return assertPlainObject(payload, mergedOptions);
}

/**
 * Serialize a JSON payload for file output while normalizing trailing
 * newlines. Helpers across the CLI and plugin previously reimplemented this
 * behaviour, often appending "\n" manually after JSON.stringify. Centralizing
 * the logic ensures all call sites respect the same newline semantics and keeps
 * indentation handling in one place.
 *
 * @param {unknown} payload Data structure to serialize.
 * @param {{
 *   replacer?: Parameters<typeof JSON.stringify>[1],
 *   space?: Parameters<typeof JSON.stringify>[2],
 *   includeTrailingNewline?: boolean,
 *   newline?: string
 * }} [options]
 * @returns {string} Stringified JSON with optional trailing newline.
 */
export function stringifyJsonForFile(payload, options = {}) {
    const {
        replacer = null,
        space = 0,
        includeTrailingNewline = true,
        newline = "\n"
    } = options;

    const serialized = JSON.stringify(payload, replacer, space);

    if (typeof serialized !== "string") {
        const payloadDescription =
            describePayloadForSerializationError(payload);

        throw new TypeError(
            `Unable to serialize ${payloadDescription} to JSON. JSON.stringify returned undefined.`
        );
    }

    if (!includeTrailingNewline) {
        return serialized;
    }

    const terminator =
        typeof newline === "string" && newline.length > 0 ? newline : "\n";

    if (serialized.endsWith(terminator)) {
        return serialized;
    }

    return `${serialized}${terminator}`;
}
