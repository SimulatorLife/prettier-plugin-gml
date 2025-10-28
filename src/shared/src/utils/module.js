import { getErrorMessage, isErrorWithCode } from "./error.js";
import { isObjectOrFunction } from "./object.js";
import { assertNonEmptyString } from "./string.js";

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

    if (!isObjectOrFunction(module)) {
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
 * call sites so fallback behaviour stays consistent across the CLI.
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
