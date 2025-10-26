// Generated from GameMakerLanguageParser.g4 by ANTLR 4.13.2
// jshint ignore: start
import antlr4 from 'antlr4';

const DEFAULT_VISIT_CHILDREN_DELEGATE = ({ fallback }) => fallback();

const { ParseTreeVisitor } = antlr4.tree;

function callParseTreeVisitor(methodName, instance, args) {
    const method = ParseTreeVisitor.prototype[methodName];
    if (typeof method !== 'function') {
        throw new TypeError(`ParseTreeVisitor method '${methodName}' is not available.`);
    }

    return method.apply(instance, args);
}

/**
 * Visitor wrapper that composes an underlying {@link ParseTreeVisitor} instead
 * of subclassing it. Behaviour for `visit*` methods is forwarded to an injected
 * delegate, while all ParseTreeVisitor primitives are invoked through the
 * helper so the public API remains intact without deep inheritance.
 */
export default class GameMakerLanguageParserVisitor {
    #visitChildrenDelegate;

    constructor(options = {}) {
        const delegate = options?.visitChildrenDelegate;
        this.#visitChildrenDelegate =
            typeof delegate === 'function' ? delegate : DEFAULT_VISIT_CHILDREN_DELEGATE;
    }

    visit(tree) {
        return callParseTreeVisitor('visit', this, [tree]);
    }

    visitChildren(node) {
        return callParseTreeVisitor('visitChildren', this, [node]);
    }

    visitTerminal(node) {
        return callParseTreeVisitor('visitTerminal', this, [node]);
    }

    visitErrorNode(node) {
        return callParseTreeVisitor('visitErrorNode', this, [node]);
    }

    _visitUsingDelegate(methodName, ctx) {
        return this.#visitChildrenDelegate({
            methodName,
            ctx,
            fallback: () => this.visitChildren(ctx)
        });
    }
}

export const VISIT_METHOD_NAMES = [
    'visitProgram',
    'visitStatementList',
    'visitStatement',
    'visitBlock',
    'visitIfStatement',
    'visitDoStatement',
    'visitWhileStatement',
    'visitForStatement',
    'visitRepeatStatement',
    'visitWithStatement',
    'visitSwitchStatement',
    'visitContinueStatement',
    'visitBreakStatement',
    'visitExitStatement',
    'visitEmptyStatement',
    'visitCaseBlock',
    'visitCaseClauses',
    'visitCaseClause',
    'visitDefaultClause',
    'visitThrowStatement',
    'visitTryStatement',
    'visitCatchProduction',
    'visitFinallyProduction',
    'visitReturnStatement',
    'visitDeleteStatement',
    'visitLiteralStatement',
    'visitAssignmentExpression',
    'visitVariableDeclarationList',
    'visitVarModifier',
    'visitVariableDeclaration',
    'visitGlobalVarStatement',
    'visitNewExpression',
    'visitIdentifierLValue',
    'visitNewLValue',
    'visitLValueExpression',
    'visitMemberIndexLValue',
    'visitMemberDotLValue',
    'visitCallLValue',
    'visitMemberIndexLValueFinal',
    'visitMemberDotLValueFinal',
    'visitExpressionSequence',
    'visitExpressionOrFunction',
    'visitParenthesizedExpression',
    'visitTernaryExpression',
    'visitFunctionExpression',
    'visitUnaryMinusExpression',
    'visitBitNotExpression',
    'visitBinaryExpression',
    'visitLiteralExpression',
    'visitNotExpression',
    'visitVariableExpression',
    'visitIncDecExpression',
    'visitCallExpression',
    'visitCallStatement',
    'visitCallableExpression',
    'visitPreIncDecStatement',
    'visitPostIncDecStatement',
    'visitIncDecStatement',
    'visitAccessor',
    'visitArguments',
    'visitArgumentList',
    'visitArgument',
    'visitTrailingComma',
    'visitAssignmentOperator',
    'visitLiteral',
    'visitTemplateStringLiteral',
    'visitTemplateStringAtom',
    'visitArrayLiteral',
    'visitElementList',
    'visitStructLiteral',
    'visitPropertyAssignment',
    'visitPropertyIdentifier',
    'visitFunctionDeclaration',
    'visitConstructorClause',
    'visitParameterList',
    'visitParameterArgument',
    'visitIdentifier',
    'visitEnumeratorDeclaration',
    'visitEnumeratorList',
    'visitEnumerator',
    'visitMacroStatement',
    'visitDefineStatement',
    'visitRegionStatement',
    'visitIdentifierStatement',
    'visitSoftKeyword',
    'visitPropertySoftKeyword',
    'visitOpenBlock',
    'visitCloseBlock',
    'visitEos',
    'visitMacroToken'
];

for (const methodName of VISIT_METHOD_NAMES) {
    Object.defineProperty(GameMakerLanguageParserVisitor.prototype, methodName, {
        value(ctx) {
            return this._visitUsingDelegate(methodName, ctx);
        },
        writable: true,
        configurable: true
    });
}
