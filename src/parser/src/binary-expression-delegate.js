export default class BinaryExpressionDelegate {
    constructor({ operators }) {
        this.operators = operators;
    }

    handle(ctx, { visit, astNode }, isEmbeddedExpression = false) {
        if (!ctx || !Object.hasOwn(ctx, "expression")) {
            return visit(ctx);
        }

        const childExpressions = ctx.expression();

        if (!childExpressions || childExpressions.length > 2) {
            return visit(ctx);
        }

        let leftNode;
        let rightNode;

        if (childExpressions.length === 1) {
            leftNode = visit(childExpressions[0]);
        } else {
            const [leftCtx, rightCtx] = childExpressions;
            const leftIsBinary =
                Object.hasOwn(leftCtx, "expression") &&
                typeof leftCtx.expression === "function";
            const rightIsBinary =
                Object.hasOwn(rightCtx, "expression") &&
                typeof rightCtx.expression === "function";

            leftNode = leftIsBinary
                ? this.handle(leftCtx, { visit, astNode }, true)
                : visit(leftCtx);

            rightNode = rightIsBinary
                ? this.handle(rightCtx, { visit, astNode }, true)
                : visit(rightCtx);
        }

        const operator = ctx.children[1].getText();

        let node = astNode(ctx, {
            type: "BinaryExpression",
            operator,
            left: leftNode,
            right: rightNode
        });

        if (
            isEmbeddedExpression &&
            this.needsParentheses(operator, leftNode, rightNode)
        ) {
            node = this.wrapInParentheses(ctx, node, astNode);
        }

        return node;
    }

    needsParentheses(operator, leftNode, rightNode) {
        if (!operator || !leftNode || !rightNode) {
            return false;
        }

        const leftOp =
            leftNode.type === "BinaryExpression"
                ? this.operators[leftNode.operator]
                : { prec: 0, assoc: "left" };
        const rightOp =
            rightNode.type === "BinaryExpression"
                ? this.operators[rightNode.operator]
                : { prec: 0, assoc: "left" };
        const currOp = this.operators[operator];

        if (currOp.assoc === "left") {
            return leftOp.prec < currOp.prec || rightOp.prec < currOp.prec;
        }

        // For right-associative operators
        return leftOp.prec <= currOp.prec || rightOp.prec <= currOp.prec;
    }

    wrapInParentheses(ctx, node, astNode) {
        return astNode(ctx, {
            type: "ParenthesizedExpression",
            expression: node,
            synthetic: true
        });
    }
}
