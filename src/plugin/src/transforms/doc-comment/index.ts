/**
 * Public API for doc-comment transforms and utilities used by the plugin printer.
 *
 * Exports DescriptionUtils and NormalizationUtils namespaces for processing
 * description lines and normalization metadata without creating circular
 * dependencies with the printer.
 */

export * as DescriptionUtils from "./description-utils.js";
export * as NormalizationUtils from "./normalization-utils.js";

export type DocCommentPrinterOptions = {
    printWidth?: number;
};

/**
 * Resolves doc-comment-specific printer options from the Prettier options object.
 */
export function resolveDocCommentPrinterOptions(options: unknown): DocCommentPrinterOptions {
    if (options !== null && typeof options === "object") {
        const record = options as Record<string, unknown>;
        return {
            printWidth: typeof record.printWidth === "number" ? record.printWidth : undefined
        };
    }

    return {};
}
