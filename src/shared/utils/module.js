/**
 * Normalize dynamically imported modules to their default export when
 * available. Centralizes the optional chaining scattered across CLI entry
 * points so CJS and ESM interop semantics stay aligned. Callers receive the
 * original namespace object when the module lacks a default export or when the
 * export is intentionally null/undefined.
 *
 * @template TModule
 * @param {TModule} module Namespace object returned from a dynamic import.
 * @returns {unknown} The module's default export when populated, otherwise the
 *          original module reference.
 */
export function resolveModuleDefaultExport(module) {
    if (module == null) {
        return module;
    }

    if (typeof module !== "object" && typeof module !== "function") {
        return module;
    }

    const defaultExport = /** @type {{ default?: unknown }} */ (module).default;
    if (defaultExport === undefined || defaultExport === null) {
        return module;
    }

    return defaultExport;
}
