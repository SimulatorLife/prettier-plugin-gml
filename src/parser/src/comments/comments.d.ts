/**
 * @typedef {object} CommentLineNode
 * @property {"CommentLine"} type
 * @property {string} value
 * @property {number} [start]
 * @property {number} [end]
 */
/**
 * Determines whether a value is a well-formed comment node.
 *
 * @param {unknown} node
 * @returns {node is CommentBlockNode | CommentLineNode}
 */
export declare function isCommentNode(node: any): boolean;
/**
 * Checks if a node is a line comment.
 *
 * @param {unknown} node
 * @returns {node is CommentLineNode}
 */
export declare function isLineComment(node: any): boolean;
/**
 * Checks if a node is a block comment.
 *
 * @param {unknown} node
 * @returns {node is CommentBlockNode}
 */
export declare function isBlockComment(node: any): boolean;
/**
 * Determines whether the provided AST node carries at least one comment.
 *
 * Nodes in parser output sometimes attach bookkeeping values or plain strings
 * to their `comments` array. The scan therefore double-checks every entry with
 * {@link isCommentNode} instead of assuming the array contents are valid. This
 * defensive guard prevents downstream formatters from tripping over stray
 * metadata while still treating an existing, but empty, `comments` array as
 * "no comments".
 *
 * @param {unknown} node Candidate AST node to inspect. Non-object inputs are
 *                       treated as comment-free.
 * @returns {boolean} `true` when the node owns at least one well-formed
 *                     comment node.
 */
export declare function hasComment(node: any): boolean;
/**
 * Returns the raw `comments` collection for a node while gracefully handling
 * parser variations where the property might be missing or hold a non-array
 * value. The returned array is the original reference so that callers can
 * observe mutations performed by upstream tooling.
 *
 * @param {unknown} owner Candidate AST node whose comments should be fetched.
 * @returns {Array<CommentBlockNode | CommentLineNode | unknown>} Either the
 *          node's comment array or a frozen empty array when no valid
 *          collection exists.
 */
export declare function getCommentArray(owner: any): readonly any[];
/**
 * Extract the string value from a comment node or raw string input.
 *
 * Guards against nullish and non-object inputs so call sites can operate on
 * parser comments or manual stubs without sprinkling defensive checks. The
 * optional `trim` flag mirrors the handful of locations that need the trimmed
 * text while preserving trailing whitespace for consumers that rely on the
 * original value.
 *
 * @param {unknown} comment Comment node or string-like value to normalize.
 * @param {{ trim?: boolean }} [options]
 * @returns {string} Normalized comment string (trimmed when requested).
 */
export declare function getCommentValue(
    comment: any,
    {
        trim
    }?: {
        trim?: boolean;
    }
): any;
/**
 * Performs a depth-first traversal to find every distinct comment node in the
 * provided AST fragment.
 *
 * Objects are tracked in a WeakSet so that the traversal can safely follow
 * parent/child references without revisiting nodes; this prevents infinite
 * loops on cyclic structures that sometimes appear in parser output while
 * still returning each comment exactly once.
 *
 * @param {unknown} root Root node (or array of nodes) to inspect. Non-object
 *                       values are ignored.
 * @returns {Array<CommentBlockNode | CommentLineNode>}
 *          Flat list of comment nodes discovered anywhere within the supplied root.
 */
export declare function collectCommentNodes(root: any): any[];
/**
 * Determines whether a given line comment represents a doc-style comment.
 *
 * Accepts both standard `// @tag` comments and single-slash variants that may
 * have been normalized earlier in the pipeline (for example `/ @param`). The
 * matcher only cares that an `@` appears after optional whitespace and an
 * optional slash, so it remains conservative and will not match ordinary
 * non-doc comments.
 *
 * @param {unknown} comment Candidate comment node.
 * @returns {boolean} `true` if the comment line looks like a doc comment.
 */
export declare function isDocCommentLine(comment: any): boolean;
