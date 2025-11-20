/**
 * Format a parser-originated syntax error into the structured message emitted
 * by the project-index reporting helpers. Enriches the original error with
 * location metadata, formatted excerpts, and a canonical `message` while
 * preserving the original text for downstream consumers.
 *
 * @param {unknown} error Value thrown by the parser.
 * @param {string | null | undefined} sourceText Source code that triggered the
 *        syntax error.
 * @param {{ filePath?: string | null, projectRoot?: string | null }} [context]
 *        Optional metadata describing where the source originated.
 * @returns {Record<string, unknown>} Normalized error decorated with display
 *          metadata and canonical messaging.
 */
export declare function formatProjectIndexSyntaxError(
    error: any,
    sourceText: any,
    context: any
): any;
