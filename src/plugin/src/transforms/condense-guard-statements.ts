import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import type { ParserTransform } from "./functional-transform.js";

type AssignmentBranchInfo = {
    type: "assignment";
    node: MutableGameMakerAstNode;
    left: MutableGameMakerAstNode;
    right: MutableGameMakerAstNode;
};

type ReturnBranchInfo = {
    type: "return";
    value: MutableGameMakerAstNode | null;
};

type BranchInfo = AssignmentBranchInfo | ReturnBranchInfo;

const GUARD_TARGET_TYPES = new Set(["Identifier", "MemberDotExpression", "MemberIndexExpression"]);

function cloneIfAvailable(node: any) {
    if (!node) {
        return node;
    }
    return Core.cloneAstNode(node);
}

export class CondenseGuardStatementsTransform
    implements ParserTransform<MutableGameMakerAstNode, Record<string, never>>
{
    public readonly name = "condense-guard-statements";
    public readonly defaultOptions = Object.freeze({});

    public transform(ast: MutableGameMakerAstNode): MutableGameMakerAstNode {
        if (!Core.isObjectLike(ast)) {
            return ast;
        }

        this.visit(ast, null, null);
        return ast;
    }

    private visit(node: any, parent: any, property: any) {
        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                this.visit(node[index], node, index);
            }
            return;
        }

        if (!Core.isObjectLike(node)) {
            return;
        }

        if (node.type === "IfStatement" && this.tryCondense(node, parent, property)) {
            return;
        }

        Core.forEachNodeChild(node, (child, key) => {
            if (key === "parent") {
                return;
            }
            this.visit(child, node, key);
        });
    }

    private tryCondense(node: any, parent: any, property: any): boolean {
        if (!node || !parent || !node.alternate) {
            return false;
        }

        if (Core.hasComment(node)) {
            return false;
        }

        const testExpr = Core.unwrapParenthesizedExpression(node.test) ?? node.test;
        if (Core.hasComment(testExpr)) {
            return false;
        }

        const consequent = this.extractBranch(node.consequent);
        const alternate = this.extractBranch(node.alternate);

        if (!consequent || !alternate) {
            return false;
        }

        if (consequent.type !== alternate.type) {
            return false;
        }

        if (consequent.type === "assignment") {
            const conseq = consequent;
            const alt = alternate as Extract<BranchInfo, { type: "assignment" }>;
            if (!this.areAssignmentTargetsEquivalent(conseq.left, alt.left)) {
                return false;
            }

            const replacement = this.buildAssignmentStatement(testExpr, conseq.left, conseq.right, alt.right, node);

            return this.replaceNode(parent, property, replacement);
        }

        if (consequent.type === "return") {
            const conseq = consequent;
            const alt = alternate as Extract<BranchInfo, { type: "return" }>;
            const replacement = this.buildReturnStatement(testExpr, conseq.value, alt.value, node);
            return this.replaceNode(parent, property, replacement);
        }

        return false;
    }

    private extractBranch(branchNode: any): BranchInfo | null {
        if (!branchNode) {
            return null;
        }

        const statement = Core.getSingleBodyStatement(branchNode) as MutableGameMakerAstNode | null;
        if (!statement) {
            return null;
        }

        if (Core.hasComment(statement)) {
            return null;
        }

        if (statement.type === "ReturnStatement") {
            if (statement.argument && Core.hasComment(statement.argument)) {
                return null;
            }

            const argument = statement.argument as MutableGameMakerAstNode | null;
            return {
                type: "return",
                value: argument
            };
        }

        const expression = Core.unwrapExpressionStatement(statement) as MutableGameMakerAstNode | null;

        if (!expression || expression.type !== "AssignmentExpression" || expression.operator !== "=") {
            return null;
        }

        const left = expression.left as MutableGameMakerAstNode | null;
        const right = expression.right as MutableGameMakerAstNode | null;
        if (!left || !right) {
            return null;
        }

        if (Core.hasComment(left) || Core.hasComment(right)) {
            return null;
        }

        return {
            type: "assignment",
            node: statement,
            left,
            right
        };
    }

    private areAssignmentTargetsEquivalent(left: any, right: any): boolean {
        if (!left || !right) {
            return false;
        }

        if (left.type !== right.type) {
            return false;
        }

        if (!GUARD_TARGET_TYPES.has(left.type)) {
            return false;
        }

        switch (left.type) {
            case "Identifier": {
                return Core.getIdentifierText(left) === Core.getIdentifierText(right);
            }
            case "MemberDotExpression":
            case "MemberIndexExpression": {
                return (
                    this.areAssignmentTargetsEquivalent(left.object, right.object) &&
                    this.areAssignmentTargetsEquivalent(left.property, right.property)
                );
            }
            default: {
                return false;
            }
        }
    }

    private buildAssignmentStatement(test: any, left: any, consequent: any, alternate: any, source: any) {
        const ternary: any = {
            type: "TernaryExpression",
            test: cloneIfAvailable(test),
            consequent: cloneIfAvailable(consequent),
            alternate: cloneIfAvailable(alternate),
            __skipTernaryParens: true
        };

        const assignment: any = {
            type: "AssignmentExpression",
            operator: "=",
            left: cloneIfAvailable(left),
            right: ternary,
            start: Core.cloneLocation(source.start),
            end: Core.cloneLocation(source.end)
        };

        return {
            type: "ExpressionStatement",
            expression: assignment,
            start: Core.cloneLocation(source.start),
            end: Core.cloneLocation(source.end)
        };
    }

    private buildReturnStatement(test: any, consequent: any, alternate: any, source: any) {
        const ternary: any = {
            type: "TernaryExpression",
            test: cloneIfAvailable(test),
            consequent: cloneIfAvailable(consequent),
            alternate: cloneIfAvailable(alternate)
        };

        return {
            type: "ReturnStatement",
            argument: ternary,
            start: Core.cloneLocation(source.start),
            end: Core.cloneLocation(source.end)
        };
    }

    private replaceNode(parent: any, property: any, replacement: any): boolean {
        if (!parent) {
            return false;
        }

        if (Array.isArray(parent)) {
            const index = property as number;
            parent.splice(index, 1, replacement);
            return true;
        }

        parent[property] = replacement;
        return true;
    }
}

export const condenseGuardStatementsTransform = new CondenseGuardStatementsTransform();
