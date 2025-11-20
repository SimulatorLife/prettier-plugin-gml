export default class BinaryExpressionDelegate {
    constructor({ operators }: { operators: any });
    handle(
        ctx: any,
        {
            visit,
            astNode
        }: {
            visit: any;
            astNode: any;
        },
        isEmbeddedExpression?: boolean
    ): any;
    needsParentheses(operator: any, leftNode: any, rightNode: any): boolean;
    wrapInParentheses(ctx: any, node: any, astNode: any): any;
}
