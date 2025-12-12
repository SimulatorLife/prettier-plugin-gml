import { Core, type GameMakerAstNode } from "@gml-modules/core";

type IdentifierKind =
    | "script"
    | "macro"
    | "enum"
    | "enum-member"
    | "global"
    | "instance"
    | "local"
    | "builtin"
    | "unknown";

type CallTargetKind =
    | "script"
    | "method"
    | "builtin"
    | "constructor"
    | "unknown";

type SemanticNode = GameMakerAstNode & {
    isBuiltIn?: boolean;
    classifications?: ReadonlyArray<string>;
    scopeId?: string | null;
    declaration?: {
        scopeId?: string | null;
    };
    identifier?: {
        name?: string;
    };
};

type CallExpressionNode = {
    callee?: SemanticNode;
    function?: SemanticNode;
    target?: SemanticNode;
};

/**
 * Infer the semantic kind of an identifier from its classifications and
 * declaration metadata. This supports hot reload coordination by enabling
 * targeted invalidation based on symbol categories.
 */
export function kindOfIdent(node: unknown): IdentifierKind {
    if (!Core.isObjectLike(node)) {
        return "unknown";
    }

    const semanticNode = node as SemanticNode;
    const classifications = Core.asArray(semanticNode.classifications);

    if (
        semanticNode.isBuiltIn === true ||
        classifications.includes("builtin")
    ) {
        return "builtin";
    }

    const kindMap: Array<[string, IdentifierKind]> = [
        ["script", "script"],
        ["macro", "macro"],
        ["enum", "enum"],
        ["enum-member", "enum-member"],
        ["global", "global"],
        ["instance", "instance"]
    ];

    for (const [classification, kind] of kindMap) {
        if (classifications.includes(classification)) {
            return kind;
        }
    }

    if (
        classifications.includes("variable") ||
        classifications.includes("parameter")
    ) {
        return "local";
    }

    return "local";
}

/**
 * Extract the identifier name from an AST node, supporting both direct name
 * properties and nested identifier structures.
 */
export function nameOfIdent(node: unknown): string {
    if (!Core.isObjectLike(node)) {
        return "";
    }

    const semanticNode = node as SemanticNode;

    if (typeof semanticNode.name === "string") {
        return semanticNode.name;
    }

    const nestedIdentifier = semanticNode.identifier;
    if (
        Core.isObjectLike(nestedIdentifier) &&
        typeof nestedIdentifier.name === "string"
    ) {
        return nestedIdentifier.name;
    }

    return "";
}

/**
 * Build a qualified symbol identifier from a node's scope and name information.
 * Returns a stable reference format for dependency tracking and hot reload
 * coordination: `{kind}/{scope}/{name}` for scoped symbols or `{kind}/{name}`
 * for global declarations.
 */
export function qualifiedSymbol(node: unknown): string | null {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const name = nameOfIdent(node);
    if (!name) {
        return null;
    }

    const kind = kindOfIdent(node);
    if (kind === "unknown") {
        return null;
    }

    const semanticNode = node as SemanticNode;
    const scopeId = semanticNode.scopeId ?? semanticNode.declaration?.scopeId;

    if (scopeId && typeof scopeId === "string") {
        return `${kind}/${scopeId}/${name}`;
    }

    return `${kind}/${name}`;
}

/**
 * Check if an identifier name follows PascalCase convention for constructors.
 */
function isPascalCaseIdentifier(callee: SemanticNode): boolean {
    if (!Core.isIdentifierNode(callee)) {
        return false;
    }

    const calleeName = callee.name;
    if (typeof calleeName !== "string" || calleeName.length === 0) {
        return false;
    }

    const firstChar = calleeName[0];
    return Boolean(
        firstChar &&
            firstChar === firstChar.toUpperCase() &&
            /^[A-Z]/.test(firstChar)
    );
}

/**
 * Determine the call target kind from a call expression node. This supports
 * hot reload invalidation by identifying whether a call targets a script,
 * method, builtin function, or other callable entity.
 */
export function callTargetKind(node: unknown): CallTargetKind {
    if (!Core.isObjectLike(node)) {
        return "unknown";
    }

    const callNode = node as CallExpressionNode;
    const callee = callNode.callee ?? callNode.function ?? callNode.target;
    if (!Core.isObjectLike(callee)) {
        return "unknown";
    }

    const semanticCallee = callee;
    const classifications = Core.asArray(semanticCallee.classifications);

    if (
        semanticCallee.isBuiltIn === true ||
        classifications.includes("builtin")
    ) {
        return "builtin";
    }

    const kindMap: Array<[string, CallTargetKind]> = [
        ["script", "script"],
        ["method", "method"],
        ["constructor", "constructor"]
    ];

    for (const [classification, kind] of kindMap) {
        if (classifications.includes(classification)) {
            return kind;
        }
    }

    if (isPascalCaseIdentifier(semanticCallee)) {
        return "constructor";
    }

    return "unknown";
}

/**
 * Extract the qualified symbol identifier for a call target. Useful for
 * dependency tracking and hot reload coordination by providing a stable
 * reference to the callable being invoked.
 */
export function callTargetSymbol(node: unknown): string | null {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const callNode = node as CallExpressionNode;
    const callee = callNode.callee ?? callNode.function ?? callNode.target;
    if (!Core.isObjectLike(callee)) {
        return null;
    }

    return qualifiedSymbol(callee);
}

export default {
    kindOfIdent,
    nameOfIdent,
    qualifiedSymbol,
    callTargetKind,
    callTargetSymbol
};
