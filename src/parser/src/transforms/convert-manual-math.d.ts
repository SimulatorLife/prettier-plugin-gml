/**
 * Convert bespoke math expressions into their builtin GML equivalents.
 *
 * The transformer recognises a curated set of safe patterns such as repeated
 * multiplications, squared distance calculations, manual trigonometry
 * conversions, and logarithm identities. Each match rewrites the AST in place
 * so the printer emits the builtin helper instead of the verbose expression.
 *
 * @param {unknown} ast - Parsed AST to rewrite in place.
 * @param {{ sourceText?: string, originalText?: string } | null} context
 *     Additional source context used to detect inline comments between nodes.
 */
export declare function convertManualMathExpressions(
    ast: any,
    context?: any
): any;
export declare function condenseScalarMultipliers(ast: any, context?: any): any;
