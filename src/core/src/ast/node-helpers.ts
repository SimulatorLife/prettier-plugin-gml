import { asArray, isNonEmptyArray } from "../utils/array.js";
import { isObjectLike } from "../utils/object.js";
import { isNonEmptyString } from "../utils/string.js";
import { assignClonedLocation } from "./locations.js";
import { hasComment } from "../comments/comment-utils.js";
import {
    VARIABLE_DECLARATION,
    VARIABLE_DECLARATOR,
    BLOCK_STATEMENT,
    IDENTIFIER,
    LITERAL,
    ASSIGNMENT_PATTERN,
    CALL_EXPRESSION,
    MEMBER_INDEX_EXPRESSION,
    PARENTHESIZED_EXPRESSION,
    BINARY_EXPRESSION,
    MEMBER_DOT_EXPRESSION
} from "./node-types.js";
import type {
    AssignmentPatternNode,
    CallExpressionNode,
    GameMakerAstLocation,
    GameMakerAstNode,
    IdentifierNode,
    LiteralNode,
    MemberIndexExpressionNode,
    ParenthesizedExpressionNode,
    VariableDeclarationNode,
    VariableDeclaratorNode
} from "./types.js";

// Shared AST helper utilities focused on querying common node shapes.
// Centralizes frequently repeated guards so printer and transform modules
// can reuse the same defensive checks without duplicating logic.

const LOGICAL_OPERATORS = new Set(["and", "&&", "or", "||"]);
const COMPARISON_OPERATORS = new Set(["==", "!=", "<>", "<=", ">=", "<", ">"]);
const ARITHMETIC_OPERATORS = new Set(["+", "-", "*", "/", "%", "^", "<<", ">>", ">>>", "|", "&"]);

/**
 * Retrieve the sole declarator from a variable declaration node.
 *
 * @param node Potential variable declaration node to inspect.
 * @returns The single declarator when present, otherwise `null`.
 */
export function getSingleVariableDeclarator(node: GameMakerAstNode | null | undefined): VariableDeclaratorNode | null {
    if (node?.type !== VARIABLE_DECLARATION) {
        return null;
    }

    const { declarations } = node;
    if (!Array.isArray(declarations) || declarations.length !== 1) {
        return null;
    }

    const [declarator] = declarations;
    if (declarator?.type !== VARIABLE_DECLARATOR) {
        return null;
    }

    return declarator as VariableDeclaratorNode;
}

/**
 * Extract the sole statement from a block statement node when present and
 * optionally apply comment guards to ensure safe transformation. Centralizes
 * the defensive pattern used across printer and transform modules when
 * reducing or unwrapping single-statement blocks.
 *
 * @param node Potential block statement node to inspect.
 * @param options Optional configuration for validation.
 * @param options.skipBlockCommentCheck When true, allows blocks with comments.
 * @param options.skipStatementCommentCheck When true, allows statements with
 *   comments.
 * @returns The single body statement when present and all guards pass,
 *   otherwise `null`.
 */
export function getSingleBodyStatement(
    node: GameMakerAstNode | null | undefined,
    {
        skipBlockCommentCheck = false,
        skipStatementCommentCheck = false
    }: {
        skipBlockCommentCheck?: boolean;
        skipStatementCommentCheck?: boolean;
    } = {}
): GameMakerAstNode | null {
    if (!node || node.type !== BLOCK_STATEMENT) {
        return null;
    }

    if (!skipBlockCommentCheck && hasComment(node)) {
        return null;
    }

    const statements = getBodyStatements(node);
    if (!Array.isArray(statements) || statements.length !== 1) {
        return null;
    }

    const [statement] = statements;
    if (!statement) {
        return null;
    }

    if (!skipStatementCommentCheck && hasComment(statement)) {
        return null;
    }

    return statement as GameMakerAstNode;
}

/**
 * Clone an AST node while preserving primitives.
 *
 * The helper mirrors the defensive guards scattered across several transforms
 * that previously reimplemented this logic. Returning the original primitive
 * values keeps behaviour consistent for callers that occasionally pass strings
 * or numbers captured from the AST.
 *
 * @param node Candidate AST fragment to clone.
 * @returns A structural clone of the node or the original primitive when
 *     cloning is unnecessary. `null` and `undefined` resolve to `null` for
 *     easier downstream checks.
 */
export function cloneAstNode(node?: unknown) {
    if (node == null) {
        return null;
    }

    if (typeof node !== "object") {
        return node;
    }

    return structuredClone(node);
}

/**
 * Iterate over the object-valued children of an AST node.
 *
 * @param node Potential AST node to inspect.
 * @param callback Invoked for each enumerable own property whose value is
 *     object-like.
 */
const IGNORED_NODE_CHILD_KEYS = new Set(["parent", "enclosingNode", "precedingNode", "followingNode"]);

export function forEachNodeChild(node: unknown, callback: (child: GameMakerAstNode, key: string) => void) {
    if (!isObjectLike(node)) {
        return;
    }

    for (const key in node as Record<string, unknown>) {
        if (IGNORED_NODE_CHILD_KEYS.has(key)) {
            continue;
        }

        if (Object.hasOwn(node as object, key)) {
            const value = (node as GameMakerAstNode)[key as keyof GameMakerAstNode];
            if (isObjectLike(value)) {
                callback(value, key);
            }
        }
    }
}

/**
 * Read and normalize the `kind` field from a variable declaration node.
 *
 * @param node - Possible variable declaration wrapper exposed by the parser.
 * @returns Lowercase declaration keyword when present, or `null` when the field
 *     is missing/unknown. The return type intentionally remains permissive so
 *     the printer can surface new keywords added by the parser without needing
 *     a project-wide update.
 */
export function getVariableDeclarationKind(
    node: GameMakerAstNode | null | undefined
): "var" | "global" | "static" | (string & {}) | null {
    if (node?.type !== VARIABLE_DECLARATION) {
        return null;
    }

    const { kind } = node as VariableDeclarationNode;
    if (!isNonEmptyString(kind)) {
        return null;
    }

    return kind.toLowerCase();
}

/**
 * Compare a declaration node against a specific keyword.
 *
 * @param node - Candidate variable declaration.
 * @param expectedKind - Keyword to match (e.g. `"var"`). The comparison is
 *     case-insensitive so callers may pass user input without pre-normalizing
 *     it.
 * @returns `true` when `node.kind` resolves to the provided keyword.
 */
export function isVariableDeclarationOfKind(
    node: GameMakerAstNode | null | undefined,
    expectedKind: string | null | undefined
): boolean {
    if (!isNonEmptyString(expectedKind)) {
        return false;
    }

    const normalizedKind = getVariableDeclarationKind(node);
    if (normalizedKind === null) {
        return false;
    }

    return normalizedKind === expectedKind.toLowerCase();
}

/**
 * Determine whether {@link node} is a `var` variable declaration.
 *
 * This convenience predicate simplifies checks for local variable declarations,
 * which are the most common variable declaration kind in GML code. Transforms
 * use this to distinguish local declarations from global or static ones.
 *
 * @param node Candidate variable declaration node.
 * @returns `true` when {@link node} declares a `var` variable.
 */
export function isVarVariableDeclaration(node: GameMakerAstNode | null | undefined): boolean {
    return isVariableDeclarationOfKind(node, "var");
}

/**
 * Normalize various identifier-like nodes to a comparable string.
 *
 * @param node Any AST fragment that may carry a name. String values are
 *     returned as-is.
 * @returns Canonical identifier text, using underscores to flatten member
 *     access (e.g. `foo.bar` -> `"foo_bar"`) or `null` when the node does not
 *     resolve to a string name. The helper treats unexpected node shapes
 *     defensively, which allows callers inside hot printer paths to skip type
 *     checks without risking runtime failures.
 */
const identifierResolvers: Readonly<Record<string, (node: GameMakerAstNode) => string | null>> = Object.freeze({
    Identifier: resolveNodeName,
    Literal: (literal) =>
        typeof (literal as LiteralNode).value === "string" ? ((literal as LiteralNode).value as string) : null,
    MemberDotExpression: (expression) => {
        const { object, property } = expression as {
            object: unknown;
            property: unknown;
        };
        if (!isIdentifierNode(object) || !isIdentifierNode(property)) {
            return null;
        }

        return `${object.name}_${property.name}`;
    },
    MemberIndexExpression: (expression) => {
        const { object, property } = expression as {
            object: unknown;
            property: unknown;
        };
        if (!isIdentifierNode(object) || !Array.isArray(property)) {
            return null;
        }

        if (property.length !== 1) {
            return null;
        }

        const indexText = getMemberIndexText(property[0]);
        return indexText === null ? null : `${object.name}_${indexText}`;
    }
});

/**
 * Extract the `name` field from an identifier-like node.
 *
 * Callers frequently need to resolve identifiers embedded within complex node
 * shapes (e.g., member expressions or variable declarators). This helper
 * centralizes the defensive `name` extraction so call sites avoid duplicating
 * the same null checks and type narrowing.
 *
 * @param node Potential identifier or node carrying a `name` property.
 * @returns The `name` string when present, otherwise `null`.
 */
export function resolveNodeName(node: GameMakerAstNode | null | undefined): string | null {
    if (isIdentifierNode(node)) {
        return node.name;
    }
    if (isObjectLike(node) && typeof (node as any).name === "string") {
        return (node as any).name;
    }
    return null;
}

/**
 * Determine whether {@link node} is a well-formed identifier node.
 *
 * The guard validates both the `type` and `name` fields so callers can safely
 * access `node.name` without additional defensive checks. Used extensively in
 * printer and transform modules when inspecting variable references or function
 * names.
 *
 * @param node Candidate value to inspect.
 * @returns `true` when {@link node} is an identifier with a string `name`.
 */
export function isIdentifierNode(node: unknown): node is IdentifierNode {
    if (!isNode(node)) return false;
    const candidate = node as { type?: unknown; name?: unknown };
    return candidate.type === IDENTIFIER && typeof candidate.name === "string";
}

/**
 * Determine whether {@link node} is a literal node.
 *
 * Literal nodes represent constant values such as numbers, strings, or boolean
 * sentinels. The guard allows callers to safely access the `value` field
 * without additional type checks.
 *
 * @param node Candidate value to inspect.
 * @returns `true` when {@link node} is a literal.
 */
export function isLiteralNode(node: unknown): node is LiteralNode {
    return hasType(node, LITERAL);
}

/**
 * Determine whether {@link node} is an assignment pattern node.
 *
 * Assignment patterns appear in parameter lists or destructuring expressions
 * where default values are provided. The guard lets callers safely access
 * pattern-specific fields without duplicating the type check.
 *
 * @param node Candidate value to inspect.
 * @returns `true` when {@link node} is an assignment pattern.
 */
export function isAssignmentPatternNode(node: unknown): node is AssignmentPatternNode {
    return hasType(node, ASSIGNMENT_PATTERN);
}

/**
 * Determine whether {@link node} is a call expression node.
 *
 * Call expressions represent function invocations. The guard permits callers to
 * safely access the `object` (callee) and `arguments` fields without further
 * defensive checks.
 *
 * @param node Candidate value to inspect.
 * @returns `true` when {@link node} is a call expression.
 */
export function isCallExpressionNode(node: unknown): node is CallExpressionNode {
    return hasType(node, CALL_EXPRESSION);
}

/**
 * Determine whether {@link node} is a member index expression node.
 *
 * Member index expressions represent bracket-style property access (e.g.,
 * `array[0]` or `obj[key]`). The guard allows callers to safely access the
 * `object` and `property` fields without additional type validation.
 *
 * @param node Candidate value to inspect.
 * @returns `true` when {@link node} is a member index expression.
 */
export function isMemberIndexExpressionNode(node: unknown): node is MemberIndexExpressionNode {
    return hasType(node, MEMBER_INDEX_EXPRESSION);
}

/**
 * Check whether {@link node} is an identifier with the exact {@link name}.
 *
 * Used when transforms need to detect references to specific variables or
 * functions. The comparison is case-sensitive to match GameMaker's identifier
 * semantics.
 *
 * @param node Candidate identifier node to inspect.
 * @param name Expected identifier name.
 * @returns `true` when {@link node} is an identifier matching {@link name}.
 */
export function isIdentifierWithName(node: GameMakerAstNode | null | undefined, name: string) {
    const identifierDetails = getIdentifierDetails(node);
    return identifierDetails?.name === name;
}

export function getIdentifierText(node: GameMakerAstNode | string | null | undefined): string | null {
    if (node == null) {
        return null;
    }

    if (typeof node === "string") {
        return node;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return resolveNodeName(node);
    }

    const resolver = identifierResolvers[type] ?? resolveNodeName;
    return resolver(node);
}

/**
 * Synthesize an identifier node while cloning the source location metadata.
 *
 * Callers frequently construct replacement identifier expressions during
 * printer rewrites or AST transforms. The helper centralizes the defensive
 * string guard and location cloning so individual call sites can focus on the
 * structural mutation instead of repeating the boilerplate checks.
 *
 * @param name Potential identifier name to assign to the node.
 * @param template Node whose location metadata should be copied.
 * @returns Identifier node with cloned locations when {@link name} is a
 *     non-empty string; otherwise `null` to signal that construction failed.
 */
export function createIdentifierNode(
    name: unknown,
    template: GameMakerAstNode | null | undefined
): IdentifierNode | null {
    if (!isNonEmptyString(name)) {
        return null;
    }

    const identifier: IdentifierNode = {
        type: IDENTIFIER,
        name
    };

    assignClonedLocation(identifier, template);

    return identifier;
}

/**
 * Clone an {@link IdentifierNode} while preserving its location metadata.
 *
 * @param node Candidate identifier to clone.
 * @returns Cloned identifier or `null` when the source node is missing or not
 *     an identifier.
 */
export function cloneIdentifier(node?: unknown): IdentifierNode | null {
    const identifierDetails = getIdentifierDetails(node);
    if (!identifierDetails) {
        return null;
    }

    return createIdentifierNode(identifierDetails.name, identifierDetails.identifier);
}

/**
 * Extract the printable index portion of a {@link MemberIndexExpression}.
 *
 * @param indexNode Possible node nested within `MemberIndexExpression.property`.
 *     Arrays are handled by the caller; this helper focuses on the single item
 *     case enforced by the parser.
 * @returns Resolved index name or `null` when the parser emitted a non-string
 *     structure (for example, computed expressions). The defensive guards let
 *     callers gracefully skip edge cases without introducing conditional
 *     branches at the call site.
 */
export function getMemberIndexText(indexNode: GameMakerAstNode | string | null | undefined): string | null {
    if (typeof indexNode === "string") {
        return indexNode;
    }

    if (indexNode == null) {
        return null;
    }

    const directName = resolveNodeName(indexNode);
    if (directName !== null) {
        return directName;
    }

    return getIdentifierText(indexNode);
}

/**
 * Return the sole property entry from a {@link MemberIndexExpression} when the
 * parser emitted exactly one index element. Several transforms guard against
 * unexpected array shapes before inspecting the property, so this helper
 * centralizes the defensive checks and keeps those call sites in sync.
 *
 * @param node Candidate member index expression.
 * @returns The single property entry or `null` when missing.
 */
export function getSingleMemberIndexPropertyEntry(node: unknown): GameMakerAstNode | null {
    if (!isNode(node) || node.type !== "MemberIndexExpression") {
        return null;
    }

    const { property } = node as MemberIndexExpressionNode;
    if (!Array.isArray(property) || property.length !== 1) {
        return null;
    }

    const [propertyEntry] = property;
    return propertyEntry ?? null;
}

/**
 * Safely read the argument array from a call-like AST node.
 *
 * @param callExpression Potential call expression node that may expose an
 *     `arguments` array.
 * @returns Normalized argument collection. Returns a shared empty array when no
 *     arguments exist so callers can iterate without additional null checks.
 */
// Delegate to the shared array normalizer so call-expression traversals always
// reuse the same frozen empty array rather than recreating bespoke helpers.
export function getCallExpressionArguments(
    callExpression: GameMakerAstNode | null | undefined
): readonly GameMakerAstNode[] {
    if (!isNode(callExpression)) {
        return asArray();
    }
    return asArray((callExpression as CallExpressionNode).arguments);
}

/**
 * Extract the identifier from a call expression's callee when present.
 *
 * Many transforms need to inspect the function being called rather than the
 * entire callee expression. This helper extracts the identifier while handling
 * the defensive guards, so call sites can focus on the name comparison logic.
 *
 * @param callExpression Potential call expression node.
 * @returns The callee identifier when present, otherwise `null`.
 */
export function getCallExpressionIdentifier(
    callExpression: GameMakerAstNode | null | undefined
): IdentifierNode | null {
    if (!isNode(callExpression) || callExpression.type !== "CallExpression") {
        return null;
    }

    const callee = (callExpression as CallExpressionNode).object;
    if (!isIdentifierNode(callee)) {
        return null;
    }

    return callee;
}

/**
 * Extract the name of the function being called in a call expression.
 *
 * Transforms frequently need to compare the callee name against known built-in
 * functions or user-defined helpers. This convenience wrapper combines the
 * identifier extraction and name resolution into a single call.
 *
 * @param callExpression Potential call expression node.
 * @returns The callee's name when present and valid, otherwise `null`.
 */
export function getCallExpressionIdentifierName(callExpression: GameMakerAstNode | null | undefined): string | null {
    const id = getCallExpressionIdentifier(callExpression);
    if (!id) return null;
    return typeof id.name === "string" ? id.name : null;
}

/**
 * Extract validated identifier metadata from {@link node}.
 *
 * Combines the identifier guard with name resolution to produce a compact
 * descriptor containing both the node and its normalized name. Transforms use
 * this when they need to inspect or clone identifier nodes while keeping the
 * defensive checks consistent.
 *
 * @param node Candidate identifier node.
 * @returns A descriptor with the identifier and its name, or `null` when the
 *     node is not a valid identifier.
 */
export function getIdentifierDetails(node: unknown): { identifier: IdentifierNode; name: string } | null {
    if (!isIdentifierNode(node)) {
        return null;
    }

    const name = resolveNodeName(node);
    if (typeof name !== "string") {
        return null;
    }

    return { identifier: node, name };
}

/**
 * Extract the `name` field from an identifier node when present.
 *
 * This convenience wrapper simplifies identifier name extraction by handling
 * the defensive checks internally. Callers receive either the name string or
 * `null`, avoiding the need to validate identifier structure at each call site.
 *
 * @param node Potential identifier node.
 * @returns The identifier's `name` when available, otherwise `null`.
 */
export function getIdentifierName(node: GameMakerAstNode | null | undefined): string | null {
    const details = getIdentifierDetails(node);
    return details ? details.name : null;
}

/**
 * Check whether a call expression invokes a function with the expected name.
 *
 * Transforms rely on this predicate to detect calls to specific built-in
 * functions or user-defined helpers. The optional `caseInsensitive` mode lets
 * callers handle GameMaker's case-insensitive function resolution when needed.
 *
 * @param callExpression Candidate call expression node.
 * @param expectedName Function name to match against.
 * @param options Optional configuration for case-sensitive matching.
 * @param options.caseInsensitive When `true`, performs case-insensitive
 *     comparison.
 * @returns `true` when the call expression's callee matches {@link expectedName}.
 */
export function isCallExpressionIdentifierMatch(
    callExpression: GameMakerAstNode | null | undefined,
    expectedName: string,
    { caseInsensitive = false } = {}
): boolean {
    if (!isNonEmptyString(expectedName)) {
        return false;
    }

    const identifierName = getCallExpressionIdentifierName(callExpression);
    if (!identifierName) {
        return false;
    }

    if (caseInsensitive) {
        const normalizedExpectedName = expectedName.toLowerCase();
        return identifierName.toLowerCase() === normalizedExpectedName;
    }

    return identifierName === expectedName;
}

/**
 * Safely retrieve an array-valued property from an AST node.
 *
 * Many node types expose child lists (e.g., `statements`, `parameters`,
 * `elements`) as array properties. This helper centralizes the defensive
 * extraction and normalization so callers receive a consistent iterable even
 * when the property is missing or malformed.
 *
 * @param node Potential AST node to inspect.
 * @param propertyName Name of the array-valued property to retrieve.
 * @returns Normalized array of child nodes or an empty array when the property
 *     is missing.
 */
export function getArrayProperty(node: unknown, propertyName: string): readonly GameMakerAstNode[] {
    if (!isNode(node)) {
        return [];
    }

    if (!isNonEmptyString(propertyName)) {
        return [];
    }

    const astNode = node as Record<PropertyKey, unknown>;
    return asArray(astNode[propertyName] as GameMakerAstNode[] | null | undefined);
}

/**
 * Check whether an AST node's array-valued property contains any entries.
 *
 * Transforms frequently need to branch based on whether a node has child
 * elements before attempting iteration. This predicate consolidates the
 * defensive checks and array validation into a single call.
 *
 * @param node Potential AST node to inspect.
 * @param propertyName Name of the array-valued property to check.
 * @returns `true` when the property exists and contains at least one element.
 */
export function hasArrayPropertyEntries(node: unknown, propertyName: string): boolean {
    if (!isNode(node)) {
        return false;
    }

    if (!isNonEmptyString(propertyName)) {
        return false;
    }

    const astNode = node as Record<PropertyKey, unknown>;
    return isNonEmptyArray(astNode[propertyName]);
}

/**
 * Extract the statement list from a block statement or program node.
 *
 * Both `Program` and `BlockStatement` nodes expose their children via a `body`
 * array. This helper retrieves the body while normalizing missing or malformed
 * shapes into an empty array, so callers can iterate without additional guards.
 *
 * @param node Potential block statement or program node.
 * @returns Array of body statements or an empty array when the body is missing.
 */
export function getBodyStatements(node: unknown): readonly GameMakerAstNode[] {
    if (!isNode(node)) {
        return [];
    }

    return asArray((node as { body?: unknown }).body);
}

/**
 * Check whether a node contains any body statements.
 *
 * Transforms use this predicate to determine whether a block is effectively
 * empty before attempting to unwrap or simplify control flow structures.
 *
 * @param node Potential block statement or program node.
 * @returns `true` when the node has at least one body statement.
 */
export function hasBodyStatements(node: unknown): boolean {
    return hasArrayPropertyEntries(node, "body");
}

/**
 * Determine whether {@link node} is a program or block statement.
 *
 * Several traversal and transformation routines need to detect container nodes
 * that hold statement lists. This predicate simplifies those checks by handling
 * both top-level programs and nested block statements.
 *
 * @param node Candidate value to inspect.
 * @returns `true` when {@link node} is either a `Program` or `BlockStatement`.
 */
export function isProgramOrBlockStatement(node: unknown): boolean {
    if (!isNode(node)) {
        return false;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return false;
    }

    return type === "Program" || type === "BlockStatement";
}

/**
 * Extract a normalized lowercase string from a literal node.
 *
 * GML keywords and identifiers are case-insensitive, so transforms frequently
 * need to compare literal values in a canonical form. This helper extracts
 * string literals and lowercases them for consistent matching.
 *
 * @param node Potential literal node.
 * @returns Lowercase string value when present, otherwise `null`.
 */
export function getLiteralStringValue(node: GameMakerAstNode | null | undefined): string | null {
    if (!isLiteralNode(node)) {
        return null;
    }

    const { value } = node;
    if (typeof value !== "string") {
        return null;
    }

    return value.toLowerCase();
}

type BooleanLiteralOptions =
    | boolean
    | {
          acceptBooleanPrimitives?: boolean;
      };

/**
 * Extract a normalized boolean value from a literal node.
 *
 * GML accepts both string-based boolean literals (`"true"` / `"false"`) and
 * JavaScript-style boolean primitives. This helper unifies both forms into a
 * canonical string representation for consistent downstream checks.
 *
 * @param node Potential literal node.
 * @param options Configuration for accepting primitive boolean values.
 * @param options.acceptBooleanPrimitives When `true`, also recognizes `true` and
 *     `false` primitive values.
 * @returns `"true"` or `"false"` when the node is a boolean literal, otherwise
 *     `null`.
 */
export function getBooleanLiteralValue(
    node: GameMakerAstNode | null | undefined,
    options: BooleanLiteralOptions = {}
): "true" | "false" | null {
    if (!isLiteralNode(node)) {
        return null;
    }

    const acceptBooleanPrimitives = typeof options === "boolean" ? options : !!options?.acceptBooleanPrimitives;

    const { value } = node;
    const isBooleanPrimitive = value === true || value === false;

    if (!isBooleanPrimitive) {
        const normalized = getLiteralStringValue(node);
        return normalized === "true" || normalized === "false" ? normalized : null;
    }

    if (!acceptBooleanPrimitives) {
        return null;
    }

    return value ? "true" : "false";
}

/**
 * Check whether {@link node} represents a boolean literal.
 *
 * This convenience predicate wraps {@link getBooleanLiteralValue} to simplify
 * boolean-detection checks. Transforms use this when branching based on literal
 * boolean values without needing to inspect the resolved value itself.
 *
 * @param node Potential literal node.
 * @param options Configuration for accepting primitive boolean values.
 * @returns `true` when {@link node} is a boolean literal.
 */
export function isBooleanLiteral(node: GameMakerAstNode | null | undefined, options?: BooleanLiteralOptions): boolean {
    return getBooleanLiteralValue(node, options) !== null;
}

/**
 * Check whether {@link node} is an `undefined` literal.
 *
 * GML represents `undefined` as a string literal in most contexts. This
 * predicate detects those cases by matching the normalized literal value.
 *
 * @param node Potential literal node.
 * @returns `true` when {@link node} is a string literal with value `"undefined"`.
 */
export function isUndefinedLiteral(node: GameMakerAstNode | null | undefined): boolean {
    return getLiteralStringValue(node) === "undefined";
}

/**
 * Check whether {@link node} represents an `undefined` value.
 *
 * GML accepts multiple forms of `undefined`: string literals, primitive
 * `undefined` values, and identifiers named `"undefined"`. This predicate
 * detects all three forms so transforms can reliably identify undefined
 * sentinels regardless of how the source code was authored.
 *
 * @param node Potential undefined sentinel.
 * @returns `true` when {@link node} represents `undefined` in any accepted form.
 */
export function isUndefinedSentinel(node: GameMakerAstNode | null | undefined): boolean {
    if (isUndefinedLiteral(node)) {
        return true;
    }

    if (!isNode(node)) {
        return false;
    }

    if (isLiteralNode(node)) {
        return node.value === undefined;
    }

    if (isIdentifierNode(node)) {
        const { name } = node;
        return typeof name === "string" && name.toLowerCase() === "undefined";
    }

    const identifierText = getIdentifierText(node);
    return typeof identifierText === "string" ? identifierText.toLowerCase() === "undefined" : false;
}

/**
 * Check whether {@link node} has a specific node type.
 *
 * This typed predicate allows callers to narrow a node to a specific type
 * category while preserving the shape of the node object for downstream
 * property access. Useful in hot paths where repeated `type` checks would be
 * more verbose.
 *
 * @param node Candidate value to inspect.
 * @param type Expected node type string.
 * @returns `true` when {@link node} has the specified {@link type}.
 */
export function hasType(node: unknown, type: string): node is Record<string, unknown> & { type: string } {
    return isNode(node) && (node as { type?: string }).type === type;
}

/**
 * Retrieve the `type` string from an AST node when present.
 *
 * This helper sits in a hot path—called for nearly every node during traversal
 * and printing—so combining the nullish check (using `==` to cover both `null`
 * and `undefined` in a single comparison) with the type guard reduces branch
 * overhead and yields measurable improvement in tight loops.
 *
 * @param node Candidate AST node-like value.
 * @returns The node's `type` when available, otherwise `null`.
 */
export function getNodeType(node?: unknown): string | null {
    if (!isNode(node)) {
        return null;
    }

    const { type } = node;
    return typeof type === "string" ? type : null;
}

/**
 * Check whether {@link value} is a valid AST node.
 *
 * This minimal predicate serves as the foundation for all node type guards.
 * Rather than checking for a specific `type` field, it only validates that the
 * value is a non-null object, allowing callers to perform further structural
 * validation as needed. The loose check improves performance in hot traversal
 * paths by deferring property access until absolutely necessary.
 *
 * @param value Candidate value to inspect.
 * @returns `true` when {@link value} is a non-null object.
 */
export function isNode(value: unknown): value is GameMakerAstNode {
    return value != null && typeof value === "object";
}

const FUNCTION_LIKE_NODE_TYPES: ReadonlyArray<string> = Object.freeze([
    "FunctionDeclaration",
    "FunctionExpression",
    "LambdaExpression",
    "ConstructorDeclaration",
    "MethodDeclaration",
    "StructFunctionDeclaration",
    "StructDeclaration"
]);

const FUNCTION_LIKE_NODE_TYPE_SET = new Set(FUNCTION_LIKE_NODE_TYPES);

/**
 * Determine whether {@link node} represents a function-like declaration or
 * expression.
 *
 * GML supports multiple function forms: top-level function declarations,
 * anonymous function expressions, lambda expressions, constructor declarations,
 * method declarations, struct function declarations, and struct declarations.
 * This predicate detects all of them so transforms can apply consistent
 * formatting and analysis logic across the entire spectrum of callable
 * constructs.
 *
 * @param node Potential function-like node.
 * @returns `true` when {@link node} is any function-like construct.
 */
export function isFunctionLikeNode(node: GameMakerAstNode | null | undefined): boolean {
    if (!isNode(node)) {
        return false;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return false;
    }

    return FUNCTION_LIKE_NODE_TYPE_SET.has(type);
}

/**
 * Extract the name of a node when present.
 *
 * Named nodes (functions, variables, methods, struct members) expose their name
 * via different fields depending on their type: `id` for declarations, `key`
 * for struct properties, or embedded within the node itself for identifiers.
 * This helper centralizes the name extraction logic so callers can retrieve the
 * canonical name without branching on node type.
 *
 * @param node Potential named node.
 * @returns The node's name when available, otherwise `null`.
 */
export function getNodeName(node: GameMakerAstNode | null | undefined): string | null {
    if (!node) {
        return null;
    }

    if ((node as { id?: unknown }).id !== undefined) {
        const idName = getIdentifierText((node as { id: GameMakerAstNode }).id);
        if (idName) {
            return idName;
        }
    }

    if ((node as { key?: unknown }).key !== undefined) {
        const keyName = getIdentifierText((node as { key: GameMakerAstNode }).key);
        if (keyName) {
            return keyName;
        }
    }

    return getIdentifierText(node);
}

/**
 * Check whether {@link operator} is a comparison binary operator.
 *
 * Comparison operators (`==`, `!=`, `<>`, `<=`, `>=`, `<`, `>`) evaluate
 * relationships between operands and yield boolean results. Transforms rely on
 * this predicate to detect comparisons that may need special precedence or
 * grouping rules.
 *
 * @param operator Candidate operator string.
 * @returns `true` when {@link operator} is a comparison binary operator.
 */
export function isComparisonBinaryOperator(operator: string): boolean {
    return COMPARISON_OPERATORS.has(operator);
}

/**
 * Check whether {@link operator} is a logical binary operator.
 *
 * Logical operators (`and`, `&&`, `or`, `||`) combine boolean expressions and
 * exhibit short-circuit evaluation. Transforms use this predicate to detect
 * logical operations that may require special precedence handling or parenthesis
 * insertion.
 *
 * @param operator Candidate operator string.
 * @returns `true` when {@link operator} is a logical binary operator.
 */
export function isLogicalBinaryOperator(operator: string): boolean {
    return LOGICAL_OPERATORS.has(operator);
}

/**
 * Check whether {@link operator} is an arithmetic binary operator.
 *
 * Arithmetic operators perform mathematical computations on numeric operands.
 * This predicate detects addition, subtraction, multiplication, division,
 * modulo, exponentiation, bitwise shift operations (`<<`, `>>`, `>>>`), and
 * bitwise AND/OR operations (`&`, `|`).
 *
 * @param operator Candidate operator string.
 * @returns `true` when {@link operator} is an arithmetic binary operator.
 */
export function isArithmeticBinaryOperator(operator: string): boolean {
    return ARITHMETIC_OPERATORS.has(operator);
}

/**
 * Check whether {@link character} is a numeric digit.
 *
 * This lightweight predicate avoids regex overhead when scanning numeric
 * literals during formatting or validation. The character-code comparison is
 * faster than `\d` regex tests for single-character checks in tight loops.
 *
 * @param character Single-character string to inspect.
 * @returns `true` when {@link character} is a digit from `"0"` to `"9"`.
 */
export function isNumericLiteralBoundaryCharacter(character: string): boolean {
    return character >= "0" && character <= "9";
}

/**
 * Traverse nested child nodes and invoke {@link callback} for each descendant.
 *
 * This helper performs shallow traversal of direct children within {@link node},
 * forwarding both array entries and object-valued properties to the callback.
 * Arrays are snapshotted before iteration so mutations within the callback do
 * not affect the traversal order. Non-object primitives are skipped to match
 * the traversal patterns used across parser and printer modules.
 *
 * @param node Candidate AST fragment to inspect.
 * @param callback Invoked for each child value that should be visited.
 */
export function visitChildNodes(node: unknown, callback: (child: unknown) => void): void {
    if (node == null) {
        return;
    }

    if (Array.isArray(node)) {
        const snapshot = [...node];
        for (const item of snapshot) {
            callback(item);
        }
        return;
    }

    if (typeof node !== "object") {
        return;
    }

    for (const key in node) {
        if (Object.hasOwn(node, key)) {
            const value = (node as Record<string, unknown>)[key];
            if (isObjectLike(value)) {
                callback(value);
            }
        }
    }
}

/**
 * Pushes {@link value} onto {@link stack} when it is an object, recursively
 * walking array entries so callers can enqueue nested nodes without repeating
 * the defensive guards. Non-object values are ignored to match the manual
 * traversal patterns used across the parser and printer.
 *
 * @param stack
 * @param value
 */
export function enqueueObjectChildValues(stack: unknown[], value: unknown): void {
    if (!value || typeof value !== "object") {
        return;
    }

    if (Array.isArray(value)) {
        const { length } = value;

        // Manual index iteration avoids the iterator/closure overhead paid by
        // `for...of` on every call. The helper sits on tight AST traversal
        // loops, so keeping the branch predictable and allocation-free helps
        // repeated walks stay lean. Prefix increment is used for consistency
        // with modern JavaScript style conventions.
        for (let index = 0; index < length; ++index) {
            const item = value[index];

            if (item !== null && typeof item === "object") {
                stack.push(item);
            }
        }
        return;
    }

    stack.push(value);
}

/**
 * Unwrap nested parenthesized expressions to reveal the inner expression.
 *
 * GML permits arbitrary levels of parenthesis nesting around expressions. This
 * helper peels away all parenthesized wrappers to expose the underlying
 * expression, which simplifies transforms that need to inspect the semantic
 * content without caring about cosmetic grouping.
 *
 * @param node Potential parenthesized expression or inner expression.
 * @returns The innermost non-parenthesized expression, or the original
 *     {@link node} when no parentheses are present.
 */
export function unwrapParenthesizedExpression(
    node: GameMakerAstNode | null | undefined
): GameMakerAstNode | null | undefined {
    let current = node;

    while (isNode(current) && current.type === PARENTHESIZED_EXPRESSION) {
        const expression = (current as ParenthesizedExpressionNode).expression;
        if (!isNode(expression)) {
            break;
        }

        current = expression;
    }

    return current;
}

/**
 * Check whether {@link node} is a binary expression with the specified operator.
 *
 * This convenience predicate simplifies operator-specific checks in math
 * transforms and precedence-handling logic. The operator comparison is
 * case-insensitive to match GML's operator semantics.
 *
 * @param node Potential binary expression node.
 * @param operator Expected operator string.
 * @returns `true` when {@link node} is a binary expression using
 *     {@link operator}.
 */
export function isBinaryOperator(node: GameMakerAstNode | null | undefined, operator: string): boolean {
    return node?.type === BINARY_EXPRESSION && (node as { operator?: string }).operator?.toLowerCase() === operator;
}

/**
 * Inspect a left-hand member expression and, when it references a property on
 * the provided identifier root, return a compact descriptor for the property
 * node and its start index. This mirrors the canonical helper used by the
 * plugin transforms and keeps the parser-local transform logic
 * self-contained.
 */
export function getStructPropertyAccess(
    left: GameMakerAstNode | null | undefined,
    identifierName?: string
): {
    propertyNode: GameMakerAstNode;
    propertyStart: number | GameMakerAstLocation | null | undefined;
} | null {
    if (!isNode(left)) {
        return null;
    }

    const object = (left as { object?: GameMakerAstNode }).object;
    if (!isIdentifierNode(object)) {
        return null;
    }

    if (identifierName !== undefined && object.name !== identifierName) {
        return null;
    }

    if (left.type === MEMBER_DOT_EXPRESSION && isNode(left.property)) {
        return {
            propertyNode: left.property,
            propertyStart: left.property?.start
        };
    }

    if (left.type === MEMBER_INDEX_EXPRESSION) {
        const propertyNode = getSingleMemberIndexPropertyEntry(left);
        if (!isNode(propertyNode)) {
            return null;
        }

        return {
            propertyNode,
            propertyStart: propertyNode?.start
        };
    }

    return null;
}
