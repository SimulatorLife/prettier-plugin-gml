/**
 * Retrieve the sole declarator from a variable declaration node.
 *
 * @param {object | null | undefined} node - Potential variable declaration
 *     node to inspect.
 * @returns {object | null} The single declarator when present, otherwise
 *     `null`.
 */
export declare function getSingleVariableDeclarator(node: any): any;
/**
 * Clone an AST node while preserving primitives.
 *
 * The helper mirrors the defensive guards scattered across several transforms
 * that previously reimplemented this logic. Returning the original primitive
 * values keeps behaviour consistent for callers that occasionally pass
 * strings or numbers captured from the AST.
 *
 * @param {unknown} node Candidate AST fragment to clone.
 * @returns {unknown} A structural clone of the node or the original primitive
 *                    when cloning is unnecessary. `null` and `undefined`
 *                    resolve to `null` for easier downstream checks.
 */
export declare function cloneAstNode(node: any): any;
/**
 * Iterate over the object-valued children of an AST node.
 *
 * @param {unknown} node Potential AST node to inspect.
 * @param {(child: object, key: string) => void} callback Invoked for each
 *        enumerable own property whose value is object-like.
 */
export declare function forEachNodeChild(node: any, callback: any): void;
/**
 * Read and normalize the `kind` field from a variable declaration node.
 *
 * @param {object | null | undefined} node - Possible variable declaration
 *     wrapper exposed by the parser.
 * @returns {"var" | "global" | "static" | string | null} Lowercase
 *     declaration keyword when present, or `null` when the field is
 *     missing/unknown. The return type intentionally remains permissive so the
 *     printer can surface new keywords added by the parser without needing a
 *     project-wide update.
 */
export declare function getVariableDeclarationKind(node: any): any;
/**
 * Compare a declaration node against a specific keyword.
 *
 * @param {object | null | undefined} node - Candidate variable declaration.
 * @param {string | null | undefined} expectedKind - Keyword to match (e.g.
 *     `"var"`). The comparison is case-insensitive so callers may pass
 *     user input without pre-normalizing it.
 * @returns {boolean} `true` when `node.kind` resolves to the
 *     provided keyword.
 */
export declare function isVariableDeclarationOfKind(
    node: any,
    expectedKind: any
): boolean;
export declare function isVarVariableDeclaration(node: any): boolean;
export declare function resolveNodeName(node: any): any;
export declare function isIdentifierNode(node: any): boolean;
export declare function isIdentifierWithName(node: any, name: any): boolean;
export declare function getIdentifierText(node: any): any;
/**
 * Synthesize an identifier node while cloning the source location metadata.
 *
 * Callers frequently construct replacement identifier expressions during
 * printer rewrites or AST transforms. The helper centralizes the defensive
 * string guard and location cloning so individual call sites can focus on the
 * structural mutation instead of repeating the boilerplate checks.
 *
 * @param {unknown} name Potential identifier name to assign to the node.
 * @param {unknown} template Node whose location metadata should be copied.
 * @returns {{ type: "Identifier", name: string } | null} Identifier node with
 *          cloned locations when {@link name} is a non-empty string; otherwise
 *          `null` to signal that construction failed.
 */
export declare function createIdentifierNode(
    name: any,
    template: any
): {
    type: string;
    name: any;
};
/**
 * Extract the printable index portion of a {@link MemberIndexExpression}.
 *
 * @param {string | null | undefined | object} indexNode Possible node nested
 *     within `MemberIndexExpression.property`. Arrays are handled by the
 *     caller; this helper focuses on the single item case enforced by the
 *     parser.
 * @returns {string | null} Resolved index name or `null` when the parser
 *     emitted a non-string structure (for example, computed expressions). The
 *     defensive guards let callers gracefully skip edge cases without
 *     introducing conditional branches at the call site.
 */
export declare function getMemberIndexText(indexNode: any): any;
/**
 * Return the sole property entry from a {@link MemberIndexExpression} when the
 * parser emitted exactly one index element. Several transforms guard against
 * unexpected array shapes before inspecting the property, so this helper
 * centralizes the defensive checks and keeps those call sites in sync.
 *
 * @param {unknown} node Candidate member index expression.
 * @returns {unknown | null} The single property entry or `null` when missing.
 */
export declare function getSingleMemberIndexPropertyEntry(node: any): any;
/**
 * Safely read the argument array from a call-like AST node.
 *
 * @param {object | null | undefined} callExpression Potential call expression
 *     node that may expose an `arguments` array.
 * @returns {Array<unknown>} Normalized argument collection. Returns a shared
 *     empty array when no arguments exist so callers can iterate without
 *     additional null checks.
 */
export declare function getCallExpressionArguments(
    callExpression: any
): readonly any[];
export declare function getCallExpressionIdentifier(callExpression: any): any;
export declare function getCallExpressionIdentifierName(
    callExpression: any
): any;
export declare function getIdentifierDetails(node: any): {
    identifier: any;
    name: string;
};
export declare function getIdentifierName(node: any): string;
export declare function isCallExpressionIdentifierMatch(
    callExpression: any,
    expectedName: any,
    {
        caseInsensitive
    }?: {
        caseInsensitive?: boolean;
    }
): boolean;
export declare function getArrayProperty(
    node: any,
    propertyName: any
): readonly any[];
export declare function hasArrayPropertyEntries(
    node: any,
    propertyName: any
): boolean;
export declare function getBodyStatements(node: any): readonly any[];
export declare function hasBodyStatements(node: any): boolean;
export declare function isProgramOrBlockStatement(node: any): boolean;
export declare function getLiteralStringValue(node: any): string;
export declare function getBooleanLiteralValue(
    node: any,
    options?: {}
): "true" | "false";
export declare function isBooleanLiteral(node: any, options: any): boolean;
export declare function isUndefinedLiteral(node: any): boolean;
export declare function isUndefinedSentinel(node: any): boolean;
/**
 * Retrieve the `type` string from an AST node when present.
 *
 * This helper sits in a hot path—called for nearly every node during
 * traversal and printing—so combining the nullish check (using `==` to cover
 * both `null` and `undefined` in a single comparison) with the type guard
 * reduces branch overhead and yields measurable improvement in tight loops.
 *
 * @param {unknown} node Candidate AST node-like value.
 * @returns {string | null} The node's `type` when available, otherwise `null`.
 */
export declare function getNodeType(node: any): string;
export declare function isNode(value: any): boolean;
export declare function isFunctionLikeNode(node: any): boolean;
export declare function borrowVisitChildNodesValueBuffer(): any;
export declare function releaseVisitChildNodesValueBuffer(buffer: any): void;
export declare function visitChildNodes(node: any, callback: any): void;
/**
 * Pushes {@link value} onto {@link stack} when it is an object, recursively
 * walking array entries so callers can enqueue nested nodes without repeating
 * the defensive guards. Non-object values are ignored to match the manual
 * traversal patterns used across the parser and printer.
 *
 * @param {Array<unknown>} stack
 * @param {unknown} value
 */
export declare function enqueueObjectChildValues(stack: any, value: any): void;
export declare function unwrapParenthesizedExpression(node: any): any;
export declare function isBinaryOperator(node: any, operator: any): boolean;
/**
 * Inspect a left-hand member expression and, when it references a property on
 * the provided identifier root, return a compact descriptor for the property
 * node and its start index. This mirrors the canonical helper used by the
 * plugin transforms and keeps the parser-local transform logic
 * self-contained.
 */
export declare function getStructPropertyAccess(
    left: any,
    identifierName: any
): {
    propertyNode: any;
    propertyStart: any;
};
