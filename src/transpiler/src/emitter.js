/**
 * Basic GML to JavaScript emitter that handles simple expressions and statements.
 * This provides utilities for mapping GML operators to JavaScript.
 */
export class GmlEmitter {
    constructor() {
        this.output = [];
        this.indentLevel = 0;
    }

    /**
     * Emit a line of code with proper indentation
     */
    emit(code) {
        const indent = "    ".repeat(this.indentLevel);
        this.output.push(indent + code);
    }

    /**
     * Get the generated JavaScript code
     */
    getCode() {
        return this.output.join("\n");
    }

    /**
     * Visit number literal - emit as-is
     */
    visitNumberLiteral(ctx) {
        if (!ctx) return "";
        return ctx.getText();
    }

    /**
     * Visit string literal - emit as-is (already has quotes)
     */
    visitStringLiteral(ctx) {
        if (!ctx) return "";
        return ctx.getText();
    }

    /**
     * Visit boolean literal - convert to JavaScript boolean
     */
    visitBooleanLiteral(ctx) {
        if (!ctx) return "";
        const text = ctx.getText();
        if (text === "true" || text === "false") {
            return text;
        }
        return "";
    }

    /**
     * Visit identifier - emit as-is for now (scope resolution comes later)
     */
    visitIdentifier(ctx) {
        if (!ctx) return "";
        return ctx.getText();
    }

    /**
     * Visit binary expression - emit as JavaScript binary expression
     */
    visitBinaryExpression(ctx) {
        if (!ctx) return "";

        const left = this.visit(ctx.left || ctx.getChild(0));
        const operator = ctx.op ? ctx.op.text : ctx.getChild(1).getText();
        const right = this.visit(ctx.right || ctx.getChild(2));

        // Handle GML-specific operators
        const jsOperator = this.mapOperator(operator);

        return `(${left} ${jsOperator} ${right})`;
    }

    /**
     * Visit unary expression - emit as JavaScript unary expression
     */
    visitUnaryExpression(ctx) {
        if (!ctx) return "";

        const operator = ctx.op ? ctx.op.text : ctx.getChild(0).getText();
        const operand = this.visit(ctx.expr || ctx.getChild(1));

        const jsOperator = this.mapUnaryOperator(operator);
        return `${jsOperator}(${operand})`;
    }

    /**
     * Visit parenthesized expression
     */
    visitParenthesizedExpression(ctx) {
        if (!ctx) return "";
        const expr = this.visit(
            ctx.expr || ctx.expression?.() || ctx.getChild(1)
        );
        return `(${expr})`;
    }

    /**
     * Map GML operators to JavaScript operators
     */
    mapOperator(op) {
        const mapping = {
            div: "/",
            mod: "%",
            and: "&&",
            or: "||",
            xor: "^",
            not: "!",
            "==": "===",
            "!=": "!=="
        };
        return mapping[op] || op;
    }

    /**
     * Map GML unary operators to JavaScript
     */
    mapUnaryOperator(op) {
        const mapping = {
            not: "!",
            "~": "~",
            "-": "-",
            "+": "+"
        };
        return mapping[op] || op;
    }

    /**
     * Visit assignment expression
     */
    visitAssignmentExpression(ctx) {
        if (!ctx) return "";

        const left = this.visit(ctx.left || ctx.lvalue?.() || ctx.getChild(0));
        const operator = ctx.op ? ctx.op.text : "=";
        const right = this.visit(
            ctx.right || ctx.expression?.() || ctx.getChild(2)
        );

        return `${left} ${operator} ${right}`;
    }

    /**
     * Visit expression statement
     */
    visitExpressionStatement(ctx) {
        if (!ctx) return "";

        const expr = this.visit(ctx.expression?.() || ctx.getChild(0));
        this.emit(`${expr};`);
        return "";
    }

    /**
     * Default visit for nodes we don't handle yet
     */
    visitChildren(ctx) {
        if (!ctx) return "";

        let result = "";
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child) {
                const childResult = this.visit(child);
                if (childResult) {
                    result += childResult;
                }
            }
        }
        return result;
    }
}

/**
 * Emit JavaScript code for a GML AST
 * @param {Object} ast - AST from GML parser
 * @returns {string} Generated JavaScript code
 */
export function emitJavaScript(ast) {
    const emitter = new GmlEmitter();
    if (!ast) return "";

    // Handle literal nodes
    if (ast.type === "Literal") {
        // GML parser returns literals as strings, emit them as-is
        return String(ast.value);
    }

    if (ast.type === "Identifier") {
        return ast.name;
    }

    // Handle identifier statement (bareword identifier as a statement)
    if (ast.type === "IdentifierStatement") {
        return emitJavaScript(ast.name) + ";";
    }

    // Handle expression nodes
    if (ast.type === "BinaryExpression") {
        const left = emitJavaScript(ast.left);
        const right = emitJavaScript(ast.right);
        const op = emitter.mapOperator(ast.operator);
        return `(${left} ${op} ${right})`;
    }

    if (ast.type === "UnaryExpression") {
        const operand = emitJavaScript(ast.argument);
        const op = emitter.mapUnaryOperator(ast.operator);
        return ast.prefix === false ? `(${operand})${op}` : `${op}(${operand})`;
    }

    if (ast.type === "AssignmentExpression") {
        const left = emitJavaScript(ast.left);
        const right = emitJavaScript(ast.right);
        // Check if this is a statement-level assignment
        return `${left} ${ast.operator} ${right}`;
    }

    if (ast.type === "ExpressionStatement") {
        return emitJavaScript(ast.expression) + ";";
    }

    // Handle member access expressions
    if (ast.type === "MemberIndexExpression") {
        const object = emitJavaScript(ast.object);
        // property is an array of index expressions
        const indices = ast.property
            .map((prop) => `[${emitJavaScript(prop)}]`)
            .join("");
        return `${object}${indices}`;
    }

    if (ast.type === "MemberDotExpression") {
        const object = emitJavaScript(ast.object);
        const property = emitJavaScript(ast.property);
        return `${object}.${property}`;
    }

    // Handle function calls
    if (ast.type === "CallExpression") {
        const callee = emitJavaScript(ast.object);
        const args = ast.arguments.map(emitJavaScript).join(", ");
        return `${callee}(${args})`;
    }

    // Handle program/block nodes
    if (ast.type === "Program" && ast.body) {
        return ast.body
            .map((stmt) => {
                const code = emitJavaScript(stmt);
                // Add semicolon if not already present and not a block
                if (code && !code.endsWith(";") && !code.endsWith("}")) {
                    return code + ";";
                }
                return code;
            })
            .filter(Boolean)
            .join("\n");
    }

    if (ast.type === "BlockStatement" && ast.body) {
        const body = ast.body.map(emitJavaScript).filter(Boolean).join("\n");
        return `{\n${body}\n}`;
    }

    // Default: return empty string for unsupported nodes
    return "";
}
