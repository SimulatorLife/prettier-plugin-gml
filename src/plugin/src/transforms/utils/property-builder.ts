import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import type { AssignmentDetails } from "./struct-assignment-matcher.js";

const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
const IDENTIFIER = "Identifier";
const LITERAL = "Literal";

export type PropertyKeyInfo = {
    identifierName: string;
    raw: unknown;
    start: unknown;
    end: unknown;
};

export class PropertyBuilder {
    private readonly isIdentifierSafe: (name: unknown) => boolean;

    constructor(isIdentifierSafe: (name: unknown) => boolean) {
        this.isIdentifierSafe = isIdentifierSafe;
    }

    buildPropertyFromAssignment(
        assignmentDetails: AssignmentDetails | null
    ): MutableGameMakerAstNode | null {
        if (!assignmentDetails) {
            return null;
        }

        const { assignment, propertyAccess } = assignmentDetails;
        if (
            !Core.isNode(assignment) ||
            assignment.type !== ASSIGNMENT_EXPRESSION
        ) {
            return null;
        }

        if (!propertyAccess) {
            return null;
        }

        const propertyKey = this.getPropertyKeyInfo(
            propertyAccess.propertyNode
        );
        const propertyName = this.buildPropertyNameNode(propertyKey);
        if (!propertyName) {
            return null;
        }

        return {
            type: "Property",
            name: propertyName,
            value: assignment.right,
            start:
                Core.cloneLocation(
                    this.getPreferredLocation(
                        propertyAccess.propertyStart,
                        assignment.start
                    )
                ) ?? null,
            end:
                Core.cloneLocation(
                    this.getPreferredLocation(
                        assignment.right?.end,
                        assignment.end
                    )
                ) ?? null
        } as unknown as MutableGameMakerAstNode;
    }

    getPropertyKeyInfo(propertyNode: unknown): PropertyKeyInfo | null {
        if (!Core.isNode(propertyNode)) {
            return null;
        }

        if (Core.isIdentifierNode(propertyNode)) {
            return {
                identifierName: propertyNode.name,
                raw: propertyNode.name,
                start: propertyNode.start,
                end: propertyNode.end
            };
        }

        if (
            Core.isLiteralNode(propertyNode) &&
            typeof propertyNode.value === "string"
        ) {
            const unquoted = Core.stripStringQuotes(propertyNode.value as any);
            return {
                identifierName: unquoted,
                raw: propertyNode.value,
                start: propertyNode.start,
                end: propertyNode.end
            };
        }

        return null;
    }

    buildPropertyNameNode(propertyKey: PropertyKeyInfo | null): unknown {
        if (!propertyKey) {
            return null;
        }

        const identifierName = propertyKey.identifierName;
        if (identifierName && this.isIdentifierSafe(identifierName)) {
            return {
                type: IDENTIFIER,
                name: identifierName,
                start: Core.cloneLocation(propertyKey.start) ?? null,
                end: Core.cloneLocation(propertyKey.end) ?? null
            };
        }

        if (typeof propertyKey.raw === "string") {
            return {
                type: LITERAL,
                value: propertyKey.raw,
                start: Core.cloneLocation(propertyKey.start) ?? null,
                end: Core.cloneLocation(propertyKey.end) ?? null
            };
        }

        return null;
    }

    getPreferredLocation(primary: unknown, fallback: unknown): unknown {
        if (Core.isNode(primary)) {
            return primary;
        }
        if (Core.isNode(fallback)) {
            return fallback;
        }
        return null;
    }
}
