import { Core, type GameMakerAstNode, type MutableGameMakerAstNode } from "@gml-modules/core";

const STRUCT_EXPRESSION = "StructExpression";
const VARIABLE_DECLARATION = "VariableDeclaration";
const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";

export type StructInitializer = {
    identifierName: string;
    structNode: MutableGameMakerAstNode;
};

export type PropertyAccess = {
    propertyNode: MutableGameMakerAstNode;
    propertyStart: unknown;
};

export type AssignmentDetails = {
    assignment: MutableGameMakerAstNode;
    propertyAccess: PropertyAccess;
};

export class StructAssignmentMatcher {
    getStructInitializer(statement: unknown): StructInitializer | null {
        if (!Core.isNode(statement)) {
            return null;
        }

        if (statement.type === VARIABLE_DECLARATION) {
            return this.extractFromVariableDeclaration(statement as MutableGameMakerAstNode);
        }

        if (statement.type === ASSIGNMENT_EXPRESSION) {
            return this.extractFromAssignment(statement as MutableGameMakerAstNode);
        }

        return null;
    }

    private extractFromVariableDeclaration(statement: MutableGameMakerAstNode): StructInitializer | null {
        const declarator = Core.getSingleVariableDeclarator(statement) as MutableGameMakerAstNode | null;
        if (!Core.isNode(declarator)) {
            return null;
        }

        if (!Core.isIdentifierNode(declarator.id)) {
            return null;
        }

        if (!this.isEmptyStructExpression(declarator.init)) {
            return null;
        }

        return {
            identifierName: declarator.id.name,
            structNode: declarator.init as MutableGameMakerAstNode
        };
    }

    private extractFromAssignment(statement: MutableGameMakerAstNode): StructInitializer | null {
        if (statement.operator !== "=") {
            return null;
        }

        if (!Core.isIdentifierNode(statement.left)) {
            return null;
        }

        if (!this.isEmptyStructExpression(statement.right)) {
            return null;
        }

        return {
            identifierName: statement.left.name,
            structNode: statement.right as MutableGameMakerAstNode
        };
    }

    private isEmptyStructExpression(node: unknown): boolean {
        if (Core.getNodeType(node) !== STRUCT_EXPRESSION) {
            return false;
        }

        const structNode = node as GameMakerAstNode;
        return !Core.isNonEmptyArray(structNode.properties);
    }

    getStructPropertyAssignmentDetails(statement: unknown, identifierName: string): AssignmentDetails | null {
        if (!Core.isNode(statement) || statement.type !== ASSIGNMENT_EXPRESSION) {
            return null;
        }

        if (statement.operator !== "=") {
            return null;
        }

        const propertyAccess = this.getStructPropertyAccess(statement.left, identifierName);
        if (!propertyAccess) {
            return null;
        }

        return {
            assignment: statement as MutableGameMakerAstNode,
            propertyAccess
        };
    }

    getStructPropertyAccess(left: unknown, identifierName: string): PropertyAccess | null {
        if (!Core.isNode(left)) {
            return null;
        }

        if (!this.isIdentifierRoot(left.object, identifierName)) {
            return null;
        }

        if (left.type === MEMBER_DOT_EXPRESSION && Core.isNode(left.property)) {
            return {
                propertyNode: left.property as MutableGameMakerAstNode,
                propertyStart: left.property?.start
            };
        }

        if (left.type === MEMBER_INDEX_EXPRESSION) {
            const propertyNode = Core.getSingleMemberIndexPropertyEntry(left);
            if (!Core.isNode(propertyNode)) {
                return null;
            }

            return {
                propertyNode: propertyNode as MutableGameMakerAstNode,
                propertyStart: propertyNode?.start
            };
        }

        return null;
    }

    isIdentifierRoot(node: unknown, identifierName: string): boolean {
        return Core.isIdentifierNode(node) && node.name === identifierName;
    }

    isIdentifierSafe(name: unknown): boolean {
        return typeof name === "string" && Core.GML_IDENTIFIER_NAME_PATTERN.test(name);
    }
}
