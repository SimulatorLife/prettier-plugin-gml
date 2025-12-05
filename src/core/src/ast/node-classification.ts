import { getNodeType } from "./node-helpers.js";
import type {
    DefineStatementNode,
    GameMakerAstNode
} from "./types.js";

const FUNCTION_LIKE_DECLARATION_TYPES = new Set([
    "FunctionDeclaration",
    "ConstructorDeclaration",
    "FunctionExpression"
]);

const DEFINE_REPLACEMENT_DIRECTIVE_VALUES = new Set<string>();
const DEFINE_REPLACEMENT_DIRECTIVE_LIST: string[] = [];

const DEFINE_REPLACEMENT_DIRECTIVE_MAP = Object.freeze({
    REGION: "#region",
    END_REGION: "#endregion",
    MACRO: "#macro"
} as const);

for (const value of Object.values(DEFINE_REPLACEMENT_DIRECTIVE_MAP)) {
    DEFINE_REPLACEMENT_DIRECTIVE_VALUES.add(value);
    DEFINE_REPLACEMENT_DIRECTIVE_LIST.push(`'${value}'`);
}

const DEFINE_REPLACEMENT_DIRECTIVE_LIST_STRING =
    DEFINE_REPLACEMENT_DIRECTIVE_LIST.join(", ");

/**
 * Directive tokens used by `DefineStatement` nodes to mimic structured
 * region/macro declarations in GML code.
 */
export const DefineReplacementDirective = DEFINE_REPLACEMENT_DIRECTIVE_MAP;

/**
 * Type-level union of supported define replacement directive tokens.
 */
export type DefineReplacementDirective =
    (typeof DefineReplacementDirective)[keyof typeof DefineReplacementDirective];

/**
 * Detects nodes that behave like functions for spacing and traversal purposes.
 *
 * @param node Candidate AST node to inspect.
 * @returns `true` when the node represents a function-like declaration.
 */
export function isFunctionLikeDeclaration(node?: unknown): boolean {
    const type = getNodeType(node);
    return type !== null && FUNCTION_LIKE_DECLARATION_TYPES.has(type);
}

function normalizeDefineReplacementDirectiveValue(
    rawDirective: unknown
): DefineReplacementDirective | null {
    if (typeof rawDirective !== "string") {
        return null;
    }

    const trimmedDirective = rawDirective.trim();
    if (trimmedDirective.length === 0) {
        return null;
    }

    const normalizedDirective = trimmedDirective.toLowerCase();
    if (!DEFINE_REPLACEMENT_DIRECTIVE_VALUES.has(normalizedDirective)) {
        throw new RangeError(
            `Define replacement directive must be one of: ${DEFINE_REPLACEMENT_DIRECTIVE_LIST_STRING}. Received: ${JSON.stringify(
                trimmedDirective
            )}.`
        );
    }

    return normalizedDirective as DefineReplacementDirective;
}

/**
 * Normalizes the `replacementDirective` field on define statements.
 *
 * @param node Candidate AST node to inspect.
 * @returns Canonical directive token or `null` when the node lacks a valid
 *          directive.
 */
export function getNormalizedDefineReplacementDirective(
    node?: GameMakerAstNode | null
): DefineReplacementDirective | null {
    if (!isDefineStatementNode(node)) {
        return null;
    }

    return normalizeDefineReplacementDirectiveValue(node.replacementDirective);
}

/**
 * Type guard for `{#define}`-style nodes so callers can access the optional
 * `replacementDirective` metadata without needing to expand the base AST type.
 */
export function isDefineStatementNode(
    node?: GameMakerAstNode | null
): node is DefineStatementNode {
    return node?.type === "DefineStatement";
}

/**
 * Detects statements that behave like macros so other modules can treat them
 * as directives rather than ordinary statements.
 *
 * @param node AST node under inspection.
 * @returns `true` when `{#macro}`-style directives or macro declarations are
 *          encountered.
 */
export function isMacroLikeStatement(
    node?: GameMakerAstNode | null
): boolean {
    const nodeType = node?.type;
    if (!nodeType) {
        return false;
    }

    if (nodeType === "MacroDeclaration") {
        return true;
    }

    if (isDefineStatementNode(node)) {
        return (
            getNormalizedDefineReplacementDirective(node) ===
            DefineReplacementDirective.MACRO
        );
    }

    return false;
}
