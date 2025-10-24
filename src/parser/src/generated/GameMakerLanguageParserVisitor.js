// Generated from GameMakerLanguageParser.g4 by ANTLR 4.13.2
// jshint ignore: start
import antlr4 from 'antlr4';

const DEFAULT_VISIT_CHILDREN_DELEGATE = ({ fallback }) => fallback();

/**
 * Visitor wrapper that relies on composition to forward each visit* method
 * through an injected delegate rather than directly overriding the
 * ParseTreeVisitor behaviour.
 */
export default class GameMakerLanguageParserVisitor extends antlr4.tree.ParseTreeVisitor {
    #visitChildrenDelegate;

    constructor(options = {}) {
        super();
        const delegate = options?.visitChildrenDelegate;
        this.#visitChildrenDelegate =
            typeof delegate === 'function' ? delegate : DEFAULT_VISIT_CHILDREN_DELEGATE;
    }

    _visitUsingDelegate(methodName, ctx) {
        return this.#visitChildrenDelegate({
            methodName,
            ctx,
            fallback: () => super.visitChildren(ctx)
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
