import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import { FunctionalParserTransform } from "./functional-transform.js";

export class ConvertUndefinedGuardAssignmentsTransform extends FunctionalParserTransform<
    Record<string, never>
> {
    constructor() {
        super("convert-undefined-guard-assignments", {});
    }

    protected execute(
        ast: MutableGameMakerAstNode,
        _options: Record<string, never>
    ): MutableGameMakerAstNode {
        void _options;
        if (!Core.isObjectLike(ast)) {
            return ast;
        }

        this.visit(ast, null, null);

        return ast;
    }

    private visit(node, parent, property) {
        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                this.visit(node[index], node, index);
            }
            return;
        }

        if (!Core.isObjectLike(node)) {
            return;
        }

        if (
            node.type === "ParenthesizedExpression" &&
            this.unwrapSyntheticParentheses(node, parent, property)
        ) {
            const replacement = parent?.[property];
            this.visit(replacement, parent, property);
            return;
        }

        if (node.type === "IfStatement") {
            const converted = this.convertIfStatement(node, parent, property);
            if (converted) {
                return;
            }
        }

        Core.forEachNodeChild(node, (child, key) => {
            if (key === "parent") {
                return;
            }
            this.visit(child, node, key);
        });
    }

    private convertIfStatement(node, parent, property) {
        if (!node || !parent) {
            return false;
        }

        if (Core.hasComment(node)) {
            return false;
        }

        if (!node.consequent) {
            return false;
        }

        const consequentAssignment = this.extractSoleAssignment(node.consequent);

        if (!consequentAssignment) {
            return false;
        }

        const targetName = Core.getIdentifierText(consequentAssignment.left);
        if (!targetName) {
            return false;
        }

        const guardTest = this.resolveUndefinedGuardExpression(node.test, targetName);
        if (!guardTest) {
            return false;
        }

        const alternateAssignment = this.extractSoleAssignment(node.alternate);

        if (alternateAssignment) {
            if (targetName !== Core.getIdentifierText(alternateAssignment.left)) {
                return false;
            }

            return this.replaceWithAssignmentStatement(
                parent,
                property,
                {
                    type: "AssignmentExpression",
                    operator: "=",
                    left: consequentAssignment.left,
                    right: {
                        type: "TernaryExpression",
                        test: guardTest,
                        consequent: consequentAssignment.right,
                        alternate: alternateAssignment.right
                    }
                },
                node
            );
        }

        return this.replaceWithAssignmentStatement(
            parent,
            property,
            {
                type: "AssignmentExpression",
                operator: "??=",
                left: consequentAssignment.left,
                right: consequentAssignment.right
            },
            node
        );
    }

    private extractSoleAssignment(branchNode) {
        if (!branchNode || branchNode.type !== "BlockStatement") {
            return null;
        }

        if (Core.hasComment(branchNode)) {
            return null;
        }

        const statements = Core.toMutableArray(branchNode.body) as Array<any>;
        if (statements.length !== 1) {
            return null;
        }

        const [statement] = statements;
        if (!statement || Core.hasComment(statement)) {
            return null;
        }

        if (statement.type === "AssignmentExpression") {
            return statement.operator === "=" ? statement : null;
        }

        if (
            statement.type === "ExpressionStatement" &&
            statement.expression &&
            !Core.hasComment(statement.expression) &&
            statement.expression.type === "AssignmentExpression"
        ) {
            return statement.expression.operator === "="
                ? statement.expression
                : null;
        }

        return null;
    }

    private resolveUndefinedGuardExpression(testNode, targetName) {
        if (!testNode) {
            return null;
        }

        if (Core.hasComment(testNode)) {
            return null;
        }

        const unwrapped = Core.unwrapParenthesizedExpression(testNode) ?? testNode;

        if (Core.hasComment(unwrapped)) {
            return null;
        }

        if (this.isIsUndefinedCall(unwrapped, targetName)) {
            return unwrapped;
        }

        if (unwrapped.type !== "BinaryExpression") {
            return null;
        }

        if (unwrapped.operator !== "==") {
            return null;
        }

        const { left, right } = unwrapped;
        const leftName = Core.getIdentifierText(left);
        const rightName = Core.getIdentifierText(right);

        if (leftName === targetName && Core.isUndefinedLiteral(right)) {
            return this.createIsUndefinedCall(left);
        }

        if (rightName === targetName && Core.isUndefinedLiteral(left)) {
            return this.createIsUndefinedCall(right);
        }

        return null;
    }

    private isIsUndefinedCall(node, targetName) {
        if (!node || node.type !== "CallExpression") {
            return false;
        }

        if (Core.hasComment(node)) {
            return false;
        }

        const callee = node.object;
        if (
            !callee ||
            callee.type !== "Identifier" ||
            callee.name !== "is_undefined"
        ) {
            return false;
        }

        const args = Core.toMutableArray(node.arguments);
        if (args.length !== 1) {
            return false;
        }

        return Core.getIdentifierText(args[0]) === targetName;
    }

    private createIsUndefinedCall(identifierNode) {
        return {
            type: "CallExpression",
            object: { type: "Identifier", name: "is_undefined" },
            arguments: [Core.cloneAstNode(identifierNode)]
        };
    }

    private replaceWithAssignmentStatement(
        parent,
        property,
        assignment,
        sourceNode
    ) {
        const replacementStatement = {
            type: "ExpressionStatement",
            expression: assignment
        };

        if (assignment.right?.type === "TernaryExpression") {
            Core.assignClonedLocation(assignment.right, sourceNode.test);
        }

        Core.assignClonedLocation(assignment, sourceNode);
        Core.assignClonedLocation(replacementStatement, sourceNode);

        if (Array.isArray(parent)) {
            parent[property] = replacementStatement;
            return true;
        }

        if (typeof property === "string") {
            parent[property] = replacementStatement;
            return true;
        }

        return false;
    }

    private unwrapSyntheticParentheses(node, parent, property) {
        if (!node || node.type !== "ParenthesizedExpression") {
            return false;
        }

        if (node.synthetic !== true) {
            return false;
        }

        if (!parent) {
            return false;
        }

        if (!property && property !== 0) {
            return false;
        }

        const expression = node.expression;
        if (!expression || typeof expression !== "object") {
            return false;
        }

        if (
            parent.type === "BinaryExpression" &&
            typeof property === "string" &&
            (property === "left" || property === "right") &&
            (parent.operator === "<" ||
                parent.operator === "<=" ||
                parent.operator === ">" ||
                parent.operator === ">=") &&
            expression.type === "BinaryExpression" &&
            (expression.operator === "+" || expression.operator === "-")
        ) {
            parent[property] = expression;
            return true;
        }

        return false;
    }
}

export const convertUndefinedGuardAssignmentsTransform =
    new ConvertUndefinedGuardAssignmentsTransform();



