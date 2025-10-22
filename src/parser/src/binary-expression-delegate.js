export default class BinaryExpressionDelegate {
    constructor({ operators }) {
        this.operators = operators;
    }

    handle(ctx, { visit, astNode }, parentBinary = null) {
        if (!ctx || !Object.hasOwn(ctx, "expression")) {
            return visit(ctx);
        }

        const childExpressions = ctx.expression();

        if (!childExpressions || childExpressions.length > 2) {
            return visit(ctx);
        }

        let leftNode;
        let rightNode;

        const operatorToken = ctx?.children?.[1];
        const operator =
            typeof operatorToken?.getText === "function"
                ? operatorToken.getText()
                : undefined;

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

            const childParentMetadata =
                typeof operator === "string"
                    ? { operator, position: null }
                    : null;

            leftNode = leftIsBinary
                ? this.handle(
                      leftCtx,
                      { visit, astNode },
                      childParentMetadata
                          ? { ...childParentMetadata, position: "left" }
                          : null
                  )
                : visit(leftCtx);

            rightNode = rightIsBinary
                ? this.handle(
                      rightCtx,
                      { visit, astNode },
                      childParentMetadata
                          ? { ...childParentMetadata, position: "right" }
                          : null
                  )
                : visit(rightCtx);
        }

        let node = astNode(ctx, {
            type: "BinaryExpression",
            operator,
            left: leftNode,
            right: rightNode
        });

        if (parentBinary && this.needsParentheses(operator, parentBinary)) {
            node = this.wrapInParentheses(
                ctx,
                node,
                astNode,
                parentBinary.position
            );
        }

        return node;
    }

    needsParentheses(operator, parentBinary) {
        if (!operator || !parentBinary || !parentBinary.operator) {
            return false;
        }

        const currentOp = this.operators[operator];
        const parentOp = this.operators[parentBinary.operator];

        if (!currentOp || !parentOp) {
            return false;
        }

        if (currentOp.prec < parentOp.prec) {
            return true;
        }

        if (currentOp.prec > parentOp.prec) {
            return false;
        }

        if (currentOp.assoc === parentOp.assoc) {
            return false;
        }

        if (parentBinary.position === "left") {
            return parentOp.assoc === "right";
        }

        if (parentBinary.position === "right") {
            return parentOp.assoc === "left";
        }

        return false;
    }

    wrapInParentheses(ctx, node, astNode, position) {
        const wrapped = astNode(ctx, {
            type: "ParenthesizedExpression",
            expression: node,
            synthetic: true
        });

        if (position != undefined) {
            wrapped.position = position;
        }

        return wrapped;
    }
}
