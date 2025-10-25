/**
 * Resolve the usage/help text for a Commander command while gracefully
 * tolerating `null`ish values and callers without a `helpInformation` method.
 * When no usage text is available on the command itself, callers can provide a
 * fallback string or thunk to lazily compute the replacement.
 *
 * @param {import("commander").Command | null | undefined} command Commander
 *        instance to inspect for usage text.
 * @param {{ fallback?: (() => string) | string | null }} [options]
 * @returns {string | null | undefined} Normalized usage string when available.
 */
export function resolveCommandUsage(command, { fallback } = {}) {
    if (command && typeof command.helpInformation === "function") {
        const usage = command.helpInformation();
        return typeof usage === "string" ? usage : String(usage);
    }

    if (typeof fallback === "function") {
        return fallback();
    }

    return fallback ?? undefined;
}
