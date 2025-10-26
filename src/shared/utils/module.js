import { getErrorMessage, isErrorWithCode } from "./error.js";
import { assertNonEmptyString } from "./string.js";

/**
 * Normalize dynamically imported modules to their default export when
 * available. This helper previously lived in the CLI layer even though the
 * logic is environment agnostic. Moving it into the shared utilities keeps the
 * Node-specific CLI helpers lightweight while making the normalizer available
 * to any consumer that needs to smooth over ESM/CJS namespace differences.
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

/**
 * Determine whether an error corresponds to a missing module dependency for
 * {@link moduleId}. Centralizes the defensive guard shared by dynamic import
 * call sites so fallback behaviour stays consistent wherever the helper is
 * used.
 *
 * @param {unknown} error Value thrown from a dynamic import.
 * @param {string} moduleId Module identifier expected in the error message.
 * @returns {boolean} `true` when the error matches the missing module.
 */
export function isMissingModuleDependency(error, moduleId) {
    if (!isErrorWithCode(error, "ERR_MODULE_NOT_FOUND")) {
        return false;
    }

    const normalizedModuleId = assertNonEmptyString(moduleId, {
        name: "moduleId",
        trim: true
    });

    const message = getErrorMessage(error, { fallback: "" });
    if (message.length === 0) {
        return false;
    }

    const quotedIdentifiers = [
        `'${normalizedModuleId}'`,
        `"${normalizedModuleId}"`
    ];

    return quotedIdentifiers.some((identifier) => message.includes(identifier));
}
