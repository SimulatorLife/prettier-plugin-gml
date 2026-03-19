import { Core } from "@gmloop/core";

type ProvenAccessorToken = "[#" | "[?" | "[|";

type IdentifierNode = Readonly<{
    type?: string;
    name?: string;
}>;

type MemberIndexNode = Readonly<{
    type?: string;
    accessor?: string;
    object?: unknown;
    property?: unknown;
}>;

type VariableDeclaratorNode = Readonly<{
    type?: string;
    id?: unknown;
    init?: unknown;
}>;

type AssignmentExpressionNode = Readonly<{
    type?: string;
    operator?: unknown;
    left?: unknown;
    right?: unknown;
}>;

type AccessorEventNode = AssignmentExpressionNode | MemberIndexNode | VariableDeclaratorNode;

/**
 * A single proven accessor rewrite discovered while scanning an AST in source
 * order.
 */
export type DataStructureAccessorReplacement = Readonly<{
    node: MemberIndexNode;
    replacementAccessor: ProvenAccessorToken;
}>;

const EXPLICIT_DATA_STRUCTURE_CONSTRUCTOR_ACCESSORS = new Map<string, ProvenAccessorToken>([
    ["ds_grid_create", "[#"],
    ["ds_list_create", "[|"],
    ["ds_map_create", "[?"]
]);

function isIdentifierNode(node: unknown): node is IdentifierNode {
    return Core.isObjectLike(node) && (node as IdentifierNode).type === "Identifier";
}

function isMemberIndexNode(node: unknown): node is MemberIndexNode {
    return Core.isObjectLike(node) && (node as MemberIndexNode).type === "MemberIndexExpression";
}

function isVariableDeclaratorNode(node: unknown): node is VariableDeclaratorNode {
    return Core.isObjectLike(node) && (node as VariableDeclaratorNode).type === "VariableDeclarator";
}

function isAssignmentExpressionNode(node: unknown): node is AssignmentExpressionNode {
    return Core.isObjectLike(node) && (node as AssignmentExpressionNode).type === "AssignmentExpression";
}

function getPropertyCount(node: MemberIndexNode): number {
    return Array.isArray(node.property) ? node.property.length : 0;
}

function shouldNormalizeMemberIndexAccessorToGrid(node: MemberIndexNode): boolean {
    return node.accessor !== "[#" && getPropertyCount(node) > 1;
}

function getNormalizedIdentifierName(node: unknown): string | null {
    if (!isIdentifierNode(node) || typeof node.name !== "string") {
        return null;
    }

    return node.name.toLowerCase();
}

function resolveExplicitConstructorAccessor(node: unknown): ProvenAccessorToken | null {
    const callIdentifierName = Core.getCallExpressionIdentifierName(node as never);
    if (!callIdentifierName) {
        return null;
    }

    return EXPLICIT_DATA_STRUCTURE_CONSTRUCTOR_ACCESSORS.get(callIdentifierName.toLowerCase()) ?? null;
}

function resolveAssignmentTargetIdentifierName(node: AssignmentExpressionNode | VariableDeclaratorNode): string | null {
    if (isVariableDeclaratorNode(node)) {
        return getNormalizedIdentifierName(node.id);
    }

    if (node.operator !== "=") {
        return null;
    }

    return getNormalizedIdentifierName(node.left);
}

function resolveAssignmentSource(node: AssignmentExpressionNode | VariableDeclaratorNode): unknown {
    return isVariableDeclaratorNode(node) ? node.init : node.right;
}

function getNodeOrderStart(node: AccessorEventNode): number {
    const startIndex = Core.getNodeStartIndex(node as never);
    return typeof startIndex === "number" && Number.isFinite(startIndex) ? startIndex : Number.POSITIVE_INFINITY;
}

function collectAccessorEventNodes(node: unknown, collectedNodes: Array<AccessorEventNode>): void {
    if (Core.shouldSkipTraversal(node)) {
        return;
    }

    if (Array.isArray(node)) {
        for (const childNode of node) {
            collectAccessorEventNodes(childNode, collectedNodes);
        }
        return;
    }

    if (isMemberIndexNode(node) || isVariableDeclaratorNode(node) || isAssignmentExpressionNode(node)) {
        collectedNodes.push(node);
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
        if (value && typeof value === "object") {
            collectAccessorEventNodes(value, collectedNodes);
        }
    }
}

function resolveProvenAccessorForMemberIndex(
    node: MemberIndexNode,
    explicitConstructorAccessorsByIdentifier: ReadonlyMap<string, ProvenAccessorToken>
): ProvenAccessorToken | null {
    if (shouldNormalizeMemberIndexAccessorToGrid(node)) {
        return "[#";
    }

    if (getPropertyCount(node) !== 1) {
        return null;
    }

    const identifierName = getNormalizedIdentifierName(node.object);
    if (!identifierName) {
        return null;
    }

    const trackedAccessor = explicitConstructorAccessorsByIdentifier.get(identifierName);
    if (trackedAccessor === "[?" || trackedAccessor === "[|") {
        return trackedAccessor;
    }

    return null;
}

/**
 * Collects the accessor rewrites that are provably safe from constructor
 * provenance and index arity alone.
 */
export function collectDataStructureAccessorReplacements(
    programNode: unknown
): ReadonlyArray<DataStructureAccessorReplacement> {
    const explicitConstructorAccessorsByIdentifier = new Map<string, ProvenAccessorToken>();
    const replacements: Array<DataStructureAccessorReplacement> = [];
    const eventNodes: Array<AccessorEventNode> = [];

    collectAccessorEventNodes(programNode, eventNodes);

    for (const node of eventNodes.toSorted((left, right) => getNodeOrderStart(left) - getNodeOrderStart(right))) {
        if (isVariableDeclaratorNode(node) || isAssignmentExpressionNode(node)) {
            const identifierName = resolveAssignmentTargetIdentifierName(node);
            if (!identifierName) {
                continue;
            }

            const explicitAccessor = resolveExplicitConstructorAccessor(resolveAssignmentSource(node));
            if (explicitAccessor) {
                explicitConstructorAccessorsByIdentifier.set(identifierName, explicitAccessor);
                continue;
            }

            explicitConstructorAccessorsByIdentifier.delete(identifierName);
            continue;
        }

        const replacementAccessor = resolveProvenAccessorForMemberIndex(node, explicitConstructorAccessorsByIdentifier);
        if (replacementAccessor && node.accessor !== replacementAccessor) {
            replacements.push({
                node,
                replacementAccessor
            });
        }
    }

    return replacements;
}
