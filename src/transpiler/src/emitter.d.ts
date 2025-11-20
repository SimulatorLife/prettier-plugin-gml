/**
 * @typedef {"local" | "self_field" | "other_field" | "global_field" | "builtin" | "script"} SemKind
 */
/**
 * @typedef {Object} SemOracle
 * @property {(node: any) => SemKind} kindOfIdent
 * @property {(node: any) => string} nameOfIdent
 * @property {(node: any) => string | null} qualifiedSymbol
 * @property {(node: any) => "script" | "builtin" | "unknown"} callTargetKind
 * @property {(node: any) => string | null} callTargetSymbol
 */
/**
 * A dummy semantic oracle for the GML transpiler.
 * This oracle uses simple heuristics to determine the scope of an identifier.
 * @returns {SemOracle}
 */
export declare function makeDummyOracle(): {
    kindOfIdent(node: any): "local" | "global_field";
    nameOfIdent(node: any): any;
    qualifiedSymbol(node: any): any;
    callTargetKind(node: any): "unknown" | "builtin";
    callTargetSymbol(node: any): any;
};
/**
 * GML to JavaScript emitter that handles expressions and statements.
 * This provides utilities for mapping GML operators to JavaScript.
 */
export declare class GmlToJsEmitter {
    /**
     * @param {SemOracle} sem
     * @param {object} [options]
     * @param {string} [options.globalsIdent]
     */
    constructor(sem: any, options?: {});
    /**
     * Emit JavaScript code for a GML AST
     * @param {Object} ast - AST from GML parser
     * @returns {string} Generated JavaScript code
     */
    emit(ast: any): any;
    visit(ast: any): any;
    visitIdentifier(ast: any): any;
    visitBinaryExpression(ast: any): string;
    visitUnaryExpression(ast: any): any;
    visitAssignmentExpression(ast: any): string;
    visitIncDecStatement(ast: any): any;
    visitMemberIndexExpression(ast: any): string;
    visitMemberDotExpression(ast: any): string;
    visitCallExpression(ast: any): any;
    visitProgram(ast: any): any;
    visitBlockStatement(ast: any): string;
    visitIfStatement(ast: any): string;
    visitForStatement(ast: any): string;
    visitWhileStatement(ast: any): string;
    visitDoUntilStatement(ast: any): string;
    visitWithStatement(ast: any): any;
    visitReturnStatement(ast: any): any;
    visitThrowStatement(ast: any): any;
    visitTryStatement(ast: any): string;
    visitRepeatStatement(ast: any): string;
    visitSwitchStatement(ast: any): string;
    visitGlobalVarStatement(ast: any): any;
    visitVariableDeclaration(ast: any): string;
    visitVariableDeclarator(ast: any): any;
    visitTernaryExpression(ast: any): string;
    visitArrayExpression(ast: any): string;
    visitStructExpression(ast: any): string;
    visitEnumDeclaration(ast: any): any;
    visitFunctionDeclaration(ast: any): string;
    mapOperator(op: any): any;
    mapUnaryOperator(op: any): any;
}
/**
 * Emit JavaScript code for a GML AST
 * @param {Object} ast - AST from GML parser
 * @param {SemOracle} [sem] - Semantic oracle
 * @returns {string} Generated JavaScript code
 */
export declare function emitJavaScript(ast: any, sem: any): any;
