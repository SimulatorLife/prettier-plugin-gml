import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

/**
 * Registry for tracking global identifiers throughout the codebase.
 */
export class GlobalIdentifierRegistry {
    private globalIdentifiers: Set<string>;

    constructor({ globalIdentifiers = new Set<string>() } = {}) {
        this.globalIdentifiers = globalIdentifiers;
    }

    /**
     * Marks an AST node as representing a global identifier.
     */
    public markIdentifier(node: MutableGameMakerAstNode | null | undefined): void {
        if (!Core.isIdentifierNode(node) || !Core.isObjectLike(node)) {
            return;
        }

        const { name } = node as { name?: unknown };
        if (typeof name !== "string" || name.length === 0) {
            return;
        }

        this.globalIdentifiers.add(name);
        const mutableNode = node as MutableGameMakerAstNode;
        mutableNode.isGlobalIdentifier = true;
    }

    /**
     * Applies stored global identifier flags to a node if it matches.
     */
    public applyToNode(node: MutableGameMakerAstNode | null | undefined): void {
        if (!Core.isIdentifierNode(node)) {
            return;
        }

        if (this.globalIdentifiers.has(node.name)) {
            const mutableNode = node as MutableGameMakerAstNode;
            mutableNode.isGlobalIdentifier = true;
        }
    }
}
