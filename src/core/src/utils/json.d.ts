/**
 * Specialized syntax error raised when JSON parsing fails. The wrapper keeps
 * the original `cause` intact (when supported) while also carrying extra
 * metadata about the source being parsed so callers can produce actionable
 * error messages without re-threading context through every call site.
 */
export declare class JsonParseError extends SyntaxError {
    constructor(message: any, { cause, source, description }?: {});
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
export declare function isJsonParseError(value: any): boolean;
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
export declare function parseJsonWithContext(text: any, options?: {}): any;
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
export declare function parseJsonObjectWithContext(
    text: any,
    options?: {}
): any;
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
export declare function stringifyJsonForFile(
    payload: any,
    options?: {}
): string;
