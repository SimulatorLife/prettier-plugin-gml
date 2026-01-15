/**
 * Browser-safe runtime helpers copied from `@gml-modules/core` so the
 * runtime-wrapper distribution can be shipped without transpiling workspace specifiers
 * such as `@gml-modules/core` into the GameMaker HTML5 build. Only the minimal set of
 * helpers that the runtime wrapper and WebSocket client actually require are reimplemented here.
 */
const APPROXIMATE_EQUALITY_SCALE_MULTIPLIER = 4;

type NullableValue<T> = T | Array<T> | null | undefined;

function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === "object" && value !== null;
}

function isNonEmptyArray(value: unknown): value is Array<unknown> {
    return Array.isArray(value) && value.length > 0;
}

/**
 * Coerce a nullable or singular value into an array so the caller can always iterate safely.
 *
 * @param value Candidate value that is either an array, singular item, or nullish.
 * @returns Normalized array representation.
 */
export function toArray<T>(value?: NullableValue<T>): Array<T> {
    if (value == null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

/**
 * Determine whether {@link value} is a string containing at least one character.
 *
 * @param value Candidate value to inspect.
 * @returns `true` when {@link value} is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

/**
 * Compare two numbers using a tolerance scaled to their magnitude so floating-point
 * rounding differences remain acceptable.
 *
 * @param a First operand.
 * @param b Second operand.
 * @returns `true` when both numbers are finite and within the scaled tolerance window.
 */
export function areNumbersApproximatelyEqual(a: number, b: number): boolean {
    if (a === b) {
        return true;
    }

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return false;
    }

    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    const tolerance = Number.EPSILON * scale * APPROXIMATE_EQUALITY_SCALE_MULTIPLIER;
    return Math.abs(a - b) <= tolerance;
}

/**
 * Determine whether {@link value} resembles an `Error` object by verifying a message property and optional name.
 *
 * @param value Candidate value to inspect.
 * @returns `true` when {@link value} matches the Error-like shape expected by the runtime wrapper.
 */
export function isErrorLike(value: unknown): value is Error {
    if (!isObjectLike(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    if (typeof candidate.message !== "string") {
        return false;
    }

    const { name } = candidate;
    if (name !== undefined && name !== null && typeof name !== "string") {
        return false;
    }

    return true;
}

/**
 * Create shallow clones of object-like entries so mutations cannot leak back to callers.
 *
 * @param entries Optional collection of entries to clone.
 * @returns Cloned entries when provided, otherwise an empty array.
 */
export function cloneObjectEntries<T>(entries?: Array<T> | null): Array<T> {
    if (!isNonEmptyArray(entries)) {
        return [];
    }

    return entries.map((entry) => (isObjectLike(entry) ? { ...entry } : entry));
}
