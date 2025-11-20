interface ScopeTrackerContext {
    enabled: boolean;
}
interface ScopeTracker {
    isEnabled(): boolean;
    enterScope(kind: string): void;
    exitScope(): void;
    declare(name: string, meta?: unknown): void;
    reference(name: string, meta?: unknown): void;
}
interface ScopeTrackerOptions {
    createScopeTracker?: (context: ScopeTrackerContext) => ScopeTracker | null;
    getIdentifierMetadata?: boolean;
    [key: string]: unknown;
}
type IdentifierRole = {
    type: string;
    kind: string;
    tags?: string[];
    scopeOverride?: string;
};
type ParserContext = any;
type ParserToken = any;
export default class GameMakerASTBuilder {
    options: ScopeTrackerOptions;
    whitespaces: unknown[];
    operatorStack: string[];
    scopeTracker: ScopeTracker | null;
    identifierRoleTracker: any;
    identifierScopeCoordinator: any;
    globalIdentifierRegistry: any;
    binaryExpressions: any;
    visitor: any;
    constructor(options?: ScopeTrackerOptions, whitespaces?: unknown[]);
    get globalIdentifiers(): any;
    visit(node: ParserContext): any;
    visitChildren(node: ParserContext): any;
    isIdentifierMetadataEnabled(): boolean;
    withScope<T>(kind: string, callback: () => T): T;
    withIdentifierRole<T>(role: IdentifierRole, callback: () => T): T;
    cloneRole(role: IdentifierRole): IdentifierRole;
    /**
     * Visit the first non-null child returned by the candidate context
     * accessors. Acts as a defensive replacement for nested null checks when
     * parsing optional grammar branches.
     *
     * @param {object | null | undefined} ctx Parser context whose children will
     *     be examined.
     * @param {Array<string>} methodNames Ordered list of child accessor method
     *     names to attempt.
     * @returns {object | null} The visited child node or `null` when no
     *     candidates are available.
     */
    visitFirstChild(
        ctx: ParserContext | null | undefined,
        methodNames: string[]
    ): any;
    astNode<
        T extends {
            [key: string]: any;
        }
    >(ctx: ParserContext, object: T): T;
    astNodeFromToken<
        T extends {
            [key: string]: any;
        }
    >(token: ParserToken, object: T): T;
    createIdentifierLocation(token: ParserToken): any;
    visitBinaryExpression(ctx: ParserContext): any;
    hasTrailingComma(commaList: any[], itemList: any[]): boolean;
    build(ctx: ParserContext): any;
    visitStatementList(ctx: ParserContext): any[];
    visitStatement(ctx: ParserContext): any;
    visitBlock(ctx: ParserContext): any;
    visitIfStatement(ctx: ParserContext): any;
    visitDoStatement(ctx: ParserContext): any;
    visitWhileStatement(ctx: ParserContext): any;
    visitForStatement(ctx: ParserContext): any;
    visitRepeatStatement(ctx: ParserContext): any;
    visitWithStatement(ctx: ParserContext): any;
    visitSwitchStatement(ctx: ParserContext): any;
    visitContinueStatement(ctx: ParserContext): any;
    visitBreakStatement(ctx: ParserContext): any;
    visitExitStatement(ctx: ParserContext): any;
    visitEmptyStatement(ctx: ParserContext): any;
    visitCaseBlock(ctx: ParserContext): any[];
    visitCaseClauses(ctx: ParserContext): any;
    visitCaseClause(ctx: ParserContext): any;
    visitDefaultClause(ctx: ParserContext): any;
    visitThrowStatement(ctx: ParserContext): any;
    visitTryStatement(ctx: ParserContext): any;
    visitCatchProduction(ctx: ParserContext): any;
    visitFinallyProduction(ctx: ParserContext): any;
    visitReturnStatement(ctx: ParserContext): any;
    visitDeleteStatement(ctx: ParserContext): any;
    visitLiteralStatement(ctx: ParserContext): any;
    visitAssignmentExpression(ctx: ParserContext): any;
    visitVariableDeclarationList(ctx: ParserContext): any;
    visitVarModifier(ctx: ParserContext): string | undefined;
    visitVariableDeclaration(ctx: ParserContext): any;
    visitGlobalVarStatement(ctx: ParserContext): any;
    visitLValueExpression(ctx: ParserContext): any;
    visitIdentifierLValue(ctx: ParserContext): any;
    visitNewLValue(ctx: ParserContext): any;
    visitMemberIndexLValue(ctx: ParserContext): any;
    visitMemberDotLValue(ctx: ParserContext): any;
    visitCallLValue(ctx: ParserContext): any;
    visitMemberIndexLValueFinal(ctx: ParserContext): any;
    visitMemberDotLValueFinal(ctx: ParserContext): any;
    visitCallableExpression(ctx: ParserContext): any;
    visitExpressionSequence(ctx: ParserContext): any[];
    visitExpressionOrFunction(ctx: ParserContext): any;
    visitTernaryExpression(ctx: ParserContext): any;
    visitNotExpression(ctx: ParserContext): any;
    visitUnaryPlusExpression(ctx: ParserContext): any;
    visitUnaryMinusExpression(ctx: ParserContext): any;
    visitCallExpression(ctx: ParserContext): any;
    visitFunctionExpression(ctx: ParserContext): any;
    visitParenthesizedExpression(ctx: ParserContext): any;
    visitIncDecStatement(ctx: ParserContext): any;
    visitIncDecExpression(ctx: ParserContext): any;
    _getIncDecOperator(ctx: ParserContext): string | null;
    _createIncDecNode(ctx: ParserContext, type: string, prefix: boolean): any;
    visitPostIncDecExpression(ctx: ParserContext): any;
    visitPostIncDecStatement(ctx: ParserContext): any;
    visitPreIncDecStatement(ctx: ParserContext): any;
    visitPreIncDecExpression(ctx: ParserContext): any;
    visitBitNotExpression(ctx: ParserContext): any;
    visitNewExpression(ctx: ParserContext): any;
    visitLiteralExpression(ctx: ParserContext): any;
    visitMemberDotExpression(ctx: ParserContext): any;
    visitMemberIndexExpression(ctx: ParserContext): any;
    visitVariableExpression(ctx: ParserContext): any;
    visitCallStatement(ctx: ParserContext): any;
    visitAccessor(ctx: ParserContext): string;
    visitArguments(ctx: ParserContext): any[];
    collectArguments(ctx: ParserContext, argList: any[]): void;
    visitAssignmentOperator(ctx: ParserContext): string;
    visitLiteral(ctx: ParserContext): any;
    visitTemplateStringLiteral(ctx: ParserContext): any;
    visitTemplateStringAtom(ctx: ParserContext): void;
    visitArrayLiteral(ctx: ParserContext): any;
    visitElementList(ctx: ParserContext): any[];
    visitStructLiteral(ctx: ParserContext): any;
    visitFunctionDeclaration(ctx: ParserContext): any;
    visitConstructorClause(ctx: ParserContext): any;
    visitInheritanceClause(ctx: ParserContext): any;
    visitStructDeclaration(ctx: ParserContext): any;
    visitParameterList(ctx: ParserContext): any[];
    visitParameterArgument(ctx: ParserContext): any;
    visitPropertyAssignment(ctx: ParserContext): any;
    visitPropertyIdentifier(ctx: ParserContext): string;
    visitIdentifier(ctx: ParserContext): any;
    visitEnumeratorDeclaration(ctx: ParserContext): any;
    visitEnumeratorList(ctx: ParserContext): any;
    visitEnumerator(ctx: ParserContext): any;
    visitMacroStatement(ctx: ParserContext): any;
    visitMacroToken(ctx: ParserContext): string;
    visitDefineStatement(ctx: ParserContext): any;
    visitRegionStatement(ctx: ParserContext): any;
    visitIdentifierStatement(ctx: ParserContext): any;
    visitKeyword(ctx: ParserContext): any;
    visitSoftKeyword(ctx: ParserContext): string | null;
    visitPropertySoftKeyword(ctx: ParserContext): string | undefined;
    visitOpenBlock(ctx: ParserContext): any;
    visitCloseBlock(ctx: ParserContext): any;
    visitEos(ctx: ParserContext): any;
}
export {};
