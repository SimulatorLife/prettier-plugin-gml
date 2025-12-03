import { asArray, isNonEmptyArray } from "../utils/array.js";
import { isObjectLike } from "../utils/object.js";
import { isNonEmptyString } from "../utils/string.js";
import { assignClonedLocation } from "./locations.js";
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
const ARITHMETIC_OPERATORS = new Set([
    "+",
    "-",
    "*",
    "/",
    "%",
    "^",
    "<<",
    ">>",
    ">>>",
    "|",
    "&"
]);

/**
 * Retrieve the sole declarator from a variable declaration node.
 *
 * @param node Potential variable declaration node to inspect.
 * @returns The single declarator when present, otherwise `null`.
 */
export function getSingleVariableDeclarator(
    node: GameMakerAstNode | null | undefined
): VariableDeclaratorNode | null {
    if (node?.type !== "VariableDeclaration") {
        return null;
    }

    const { declarations } = node;
    if (!Array.isArray(declarations) || declarations.length !== 1) {
        return null;
    }

    const [declarator] = declarations;
    if (declarator?.type !== "VariableDeclarator") {
        return null;
    }

    return declarator as VariableDeclaratorNode;
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
    if (node === null || node === undefined) {
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
export function forEachNodeChild(
    node: unknown,
    callback: (child: GameMakerAstNode, key: string) => void
) {
    if (!isObjectLike(node)) {
        return;
    }

    for (const key in node as Record<string, unknown>) {
        if (Object.hasOwn(node as object, key)) {
            const value = (node as GameMakerAstNode)[
                key as keyof GameMakerAstNode
            ];
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
    if (node?.type !== "VariableDeclaration") {
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

export function isVarVariableDeclaration(
    node: GameMakerAstNode | null | undefined
): boolean {
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
const identifierResolvers: Readonly<
    Record<string, (node: GameMakerAstNode) => string | null>
> = Object.freeze({
    Identifier: resolveNodeName,
    Literal: (literal) =>
        typeof (literal as LiteralNode).value === "string"
            ? ((literal as LiteralNode).value as string)
            : null,
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

export function resolveNodeName(
    node: GameMakerAstNode | null | undefined
): string | null {
    if (isIdentifierNode(node)) {
        return node.name;
    }
    if (isObjectLike(node) && typeof (node as any).name === "string") {
        return (node as any).name;
    }
    return null;
}

export function isIdentifierNode(node: unknown): node is IdentifierNode {
    if (!isNode(node)) return false;
    const candidate = node as { type?: unknown; name?: unknown };
    return (
        candidate.type === "Identifier" && typeof candidate.name === "string"
    );
}

export function isLiteralNode(node: unknown): node is LiteralNode {
    if (!isNode(node)) return false;
    return (node as { type?: unknown }).type === "Literal";
}

export function isAssignmentPatternNode(
    node: unknown
): node is AssignmentPatternNode {
    if (!isNode(node)) return false;
    return (node as { type?: unknown }).type === "AssignmentPattern";
}

export function isCallExpressionNode(
    node: unknown
): node is CallExpressionNode {
    if (!isNode(node)) return false;
    return (node as { type?: unknown }).type === "CallExpression";
}

export function isMemberIndexExpressionNode(
    node: unknown
): node is MemberIndexExpressionNode {
    if (!isNode(node)) return false;
    return (node as { type?: unknown }).type === "MemberIndexExpression";
}

export function isIdentifierWithName(
    node: GameMakerAstNode | null | undefined,
    name: string
) {
    const identifierDetails = getIdentifierDetails(node);
    return identifierDetails?.name === name;
}

export function getIdentifierText(
    node: GameMakerAstNode | string | null | undefined
): string | null {
    if (node === undefined || node === null) {
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
        type: "Identifier",
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

    return createIdentifierNode(
        identifierDetails.name,
        identifierDetails.identifier
    );
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
export function getMemberIndexText(
    indexNode: GameMakerAstNode | string | null | undefined
): string | null {
    if (typeof indexNode === "string") {
        return indexNode;
    }

    if (indexNode === undefined || indexNode === null) {
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
export function getSingleMemberIndexPropertyEntry(
    node: unknown
): GameMakerAstNode | null {
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

export function getCallExpressionIdentifierName(
    callExpression: GameMakerAstNode | null | undefined
): string | null {
    const id = getCallExpressionIdentifier(callExpression);
    if (!id) return null;
    return typeof id.name === "string" ? id.name : null;
}

export function getIdentifierDetails(
    node: unknown
): { identifier: IdentifierNode; name: string } | null {
    if (!isIdentifierNode(node)) {
        return null;
    }

    const name = resolveNodeName(node);
    if (typeof name !== "string") {
        return null;
    }

    return { identifier: node, name };
}

export function getIdentifierName(
    node: GameMakerAstNode | null | undefined
): string | null {
    const details = getIdentifierDetails(node);
    return details ? details.name : null;
}

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

export function getArrayProperty(
    node: unknown,
    propertyName: string
): readonly GameMakerAstNode[] {
    if (!isNode(node)) {
        return [];
    }

    if (!isNonEmptyString(propertyName)) {
        return [];
    }

    const astNode = node as Record<PropertyKey, unknown>;
    return asArray(
        astNode[propertyName] as GameMakerAstNode[] | null | undefined
    );
}

export function hasArrayPropertyEntries(
    node: unknown,
    propertyName: string
): boolean {
    if (!isNode(node)) {
        return false;
    }

    if (!isNonEmptyString(propertyName)) {
        return false;
    }

    const astNode = node as Record<PropertyKey, unknown>;
    return isNonEmptyArray(astNode[propertyName]);
}

export function getBodyStatements(node: unknown): readonly GameMakerAstNode[] {
    if (!isNode(node)) {
        return [];
    }

    return asArray((node as { body?: unknown }).body);
}

export function hasBodyStatements(node: unknown): boolean {
    return hasArrayPropertyEntries(node, "body");
}

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

export function getLiteralStringValue(
    node: GameMakerAstNode | null | undefined
): string | null {
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

export function getBooleanLiteralValue(
    node: GameMakerAstNode | null | undefined,
    options: BooleanLiteralOptions = {}
): "true" | "false" | null {
    if (!isLiteralNode(node)) {
        return null;
    }

    const acceptBooleanPrimitives =
        typeof options === "boolean"
            ? options
            : !!options?.acceptBooleanPrimitives;

    const { value } = node;
    const isBooleanPrimitive = value === true || value === false;

    if (!isBooleanPrimitive) {
        const normalized = getLiteralStringValue(node);
        return normalized === "true" || normalized === "false"
            ? normalized
            : null;
    }

    if (!acceptBooleanPrimitives) {
        return null;
    }

    return value ? "true" : "false";
}

export function isBooleanLiteral(
    node: GameMakerAstNode | null | undefined,
    options?: BooleanLiteralOptions
): boolean {
    return getBooleanLiteralValue(node, options) !== null;
}

export function isUndefinedLiteral(
    node: GameMakerAstNode | null | undefined
): boolean {
    return getLiteralStringValue(node) === "undefined";
}

export function isUndefinedSentinel(
    node: GameMakerAstNode | null | undefined
): boolean {
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
    return typeof identifierText === "string"
        ? identifierText.toLowerCase() === "undefined"
        : false;
}

export function hasType(
    node: unknown,
    type: string
): node is Record<string, unknown> & { type: string } {
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

export function isFunctionLikeNode(
    node: GameMakerAstNode | null | undefined
): boolean {
    if (!isNode(node)) {
        return false;
    }

    const { type } = node;
    if (typeof type !== "string") {
        return false;
    }

    return FUNCTION_LIKE_NODE_TYPE_SET.has(type);
}

export function getNodeName(
    node: GameMakerAstNode | null | undefined
): string | null {
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
        const keyName = getIdentifierText(
            (node as { key: GameMakerAstNode }).key
        );
        if (keyName) {
            return keyName;
        }
    }

    return getIdentifierText(node);
}

/**
 * Iterate over child nodes nested within {@link node}, invoking
 * {@link callback} for each descendant that should be inspected.
 *
 * Arrays forward every entry (including primitives) so traversal helpers can
 * reuse their existing guard rails without rebuilding bespoke loops. Plain
 * objects only forward nested objects to mirror the defensive checks found in
 * the transform visitors that previously duplicated this logic.
 *
 * @param node Candidate AST fragment to inspect.
 * @param callback Invoked for each descendant value.
 */
export function isComparisonBinaryOperator(operator: string): boolean {
    return COMPARISON_OPERATORS.has(operator);
}

export function isLogicalBinaryOperator(operator: string): boolean {
    return LOGICAL_OPERATORS.has(operator);
}

export function isArithmeticBinaryOperator(operator: string): boolean {
    return ARITHMETIC_OPERATORS.has(operator);
}

export function isNumericLiteralBoundaryCharacter(character: string): boolean {
    return character >= "0" && character <= "9";
}

export function visitChildNodes(
    node: unknown,
    callback: (child: unknown) => void
): void {
    if (node === undefined || node === null) {
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
            if (
                value !== undefined &&
                value !== null &&
                typeof value === "object"
            ) {
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
export function enqueueObjectChildValues(
    stack: unknown[],
    value: unknown
): void {
    if (!value || typeof value !== "object") {
        return;
    }

    if (Array.isArray(value)) {
        const { length } = value;

        // Manual index iteration avoids the iterator/closure overhead paid by
        // `for...of` on every call. The helper sits on tight AST traversal
        // loops, so keeping the branch predictable and allocation-free helps
        // repeated walks stay lean.
        for (let index = 0; index < length; index += 1) {
            const item = value[index];

            if (item !== null && typeof item === "object") {
                stack.push(item);
            }
        }
        return;
    }

    stack.push(value);
}

export function unwrapParenthesizedExpression(
    node: GameMakerAstNode | null | undefined
): GameMakerAstNode | null | undefined {
    let current = node;

    while (isNode(current) && current.type === "ParenthesizedExpression") {
        const expression = (current as ParenthesizedExpressionNode).expression;
        if (!isNode(expression)) {
            break;
        }

        current = expression;
    }

    return current;
}

// Small binary-operator predicate used by multiple math transforms.
export function isBinaryOperator(
    node: GameMakerAstNode | null | undefined,
    operator: string
): boolean {
    return (
        node?.type === "BinaryExpression" &&
        (node as { operator?: string }).operator?.toLowerCase() === operator
    );
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

    if (left.type === "MemberDotExpression" && isNode(left.property)) {
        return {
            propertyNode: left.property,
            propertyStart: left.property?.start
        };
    }

    if (left.type === "MemberIndexExpression") {
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
