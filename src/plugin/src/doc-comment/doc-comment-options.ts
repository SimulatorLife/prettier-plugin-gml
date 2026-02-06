/**
 * Shared doc-comment options configuration.
 *
 * This module provides shared configuration utilities for doc-comment processing
 * that can be consumed by both printer and transforms without creating circular
 * dependencies.
 *
 * Architectural boundaries:
 * - This module owns: Doc-comment options resolution and defaults
 * - Consumers (printer/transforms) depend on: this public API only
 * - Dependencies: Core workspace for utilities, plugin constants
 *
 * By placing options resolution in a shared module:
 * 1. Both printer and transforms can depend on it without circular references
 * 2. The configuration contract is centralized and consistent
 * 3. Changes to options handling only require updates to this single file
 */

import { Core } from "@gml-modules/core";

import { DEFAULT_PRINT_WIDTH } from "../constants.js";

export type DocCommentPrinterOptions = Record<string, unknown> & {
    printWidth?: number;
};

export type ResolvedDocCommentPrinterOptions = DocCommentPrinterOptions & {
    printWidth: number;
};

export function resolveDocCommentPrinterOptions(options?: DocCommentPrinterOptions): ResolvedDocCommentPrinterOptions {
    const printWidth = Core.coercePositiveIntegerOption(options?.printWidth, DEFAULT_PRINT_WIDTH);

    return {
        ...options,
        printWidth
    };
}
