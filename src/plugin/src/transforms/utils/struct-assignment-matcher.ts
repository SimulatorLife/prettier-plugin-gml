import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

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
            const declarator = Core.getSingleVariableDeclarator(
                statement
            ) as MutableGameMakerAstNode | null;
            if (!Core.isNode(declarator)) {
                return null;
            }
            if (!Core.isIdentifierNode(declarator.id)) {
                return null;
            }

            if (Core.getNodeType(declarator.init) !== STRUCT_EXPRESSION) {
                return null;
            }

            if (
                Array.isArray((declarator.init as any).properties) &&
                (declarator.init as any).properties.length > 0
            ) {
                return null;
            }

            return {
                identifierName: declarator.id.name,
                structNode: declarator.init as MutableGameMakerAstNode
            };
        }

        if (statement.type === ASSIGNMENT_EXPRESSION) {
            if (statement.operator !== "=") {
                return null;
            }

            if (!Core.isIdentifierNode(statement.left)) {
                return null;
            }

            if (Core.getNodeType(statement.right) !== STRUCT_EXPRESSION) {
                return null;
            }

            if (
                Array.isArray((statement.right as any).properties) &&
                (statement.right as any).properties.length > 0
            ) {
                return null;
            }

            return {
                identifierName: statement.left.name,
                structNode: statement.right as MutableGameMakerAstNode
            };
        }

        return null;
    }

    getStructPropertyAssignmentDetails(
        statement: unknown,
        identifierName: string
    ): AssignmentDetails | null {
        if (
            !Core.isNode(statement) ||
            statement.type !== ASSIGNMENT_EXPRESSION
        ) {
            return null;
        }

        if (statement.operator !== "=") {
            return null;
        }

        const propertyAccess = this.getStructPropertyAccess(
            statement.left,
            identifierName
        );
        if (!propertyAccess) {
            return null;
        }

        return {
            assignment: statement as MutableGameMakerAstNode,
            propertyAccess
        };
    }

    getStructPropertyAccess(
        left: unknown,
        identifierName: string
    ): PropertyAccess | null {
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
        return (
            typeof name === "string" &&
            Core.GML_IDENTIFIER_NAME_PATTERN.test(name)
        );
    }
}
