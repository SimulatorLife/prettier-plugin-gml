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
        const body = ast.body
            .map((stmt) => {
                const code = emitJavaScript(stmt);
                // Add semicolon if not already present and not a block-like statement
                if (
                    code &&
                    !code.endsWith(";") &&
                    !code.endsWith("}") &&
                    !code.trim().startsWith("if") &&
                    !code.trim().startsWith("for") &&
                    !code.trim().startsWith("while")
                ) {
                    return code + ";";
                }
                return code;
            })
            .filter(Boolean)
            .join("\n");
        return `{\n${body}\n}`;
    }

    // Handle control flow statements
    if (ast.type === "IfStatement") {
        let result = "if ";

        // Handle test condition
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? `(${emitJavaScript(ast.test.expression)})`
                    : `(${emitJavaScript(ast.test)})`;
        }

        // Handle consequent
        if (ast.consequent) {
            if (ast.consequent.type === "BlockStatement") {
                result += ` ${emitJavaScript(ast.consequent)}`;
            } else {
                // Single statement without braces
                result += ` {\n${emitJavaScript(ast.consequent)};\n}`;
            }
        }

        // Handle alternate (else clause)
        if (ast.alternate) {
            if (ast.alternate.type === "IfStatement") {
                // else if
                result += ` else ${emitJavaScript(ast.alternate)}`;
            } else if (ast.alternate.type === "BlockStatement") {
                result += ` else ${emitJavaScript(ast.alternate)}`;
            } else {
                // Single statement without braces
                result += ` else {\n${emitJavaScript(ast.alternate)};\n}`;
            }
        }

        return result;
    }

    if (ast.type === "ForStatement") {
        let result = "for (";

        // Handle init
        if (ast.init) {
            result += emitJavaScript(ast.init);
        }
        result += "; ";

        // Handle test
        if (ast.test) {
            result += emitJavaScript(ast.test);
        }
        result += "; ";

        // Handle update
        if (ast.update) {
            result += emitJavaScript(ast.update);
        }
        result += ")";

        // Handle body
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        return result;
    }

    if (ast.type === "WhileStatement") {
        let result = "while ";

        // Handle test condition
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? `(${emitJavaScript(ast.test.expression)})`
                    : `(${emitJavaScript(ast.test)})`;
        }

        // Handle body
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        return result;
    }

    if (ast.type === "DoUntilStatement") {
        let result = "do";

        // Handle body
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        result += " while (";

        // Handle test condition - note: do-until is do-while with negated condition
        if (ast.test) {
            const testExpr =
                ast.test.type === "ParenthesizedExpression"
                    ? emitJavaScript(ast.test.expression)
                    : emitJavaScript(ast.test);
            result += `!(${testExpr})`;
        }
        result += ")";

        return result;
    }

    // Handle return statement
    if (ast.type === "ReturnStatement") {
        if (ast.argument) {
            return `return ${emitJavaScript(ast.argument)}`;
        }
        return "return";
    }

    // Handle break statement
    if (ast.type === "BreakStatement") {
        return "break";
    }

    // Handle continue statement
    if (ast.type === "ContinueStatement") {
        return "continue";
    }

    // Handle repeat statement - convert to for loop
    if (ast.type === "RepeatStatement") {
        let result = "for (let __repeat_count = ";

        // Handle test expression (number of times to repeat)
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? emitJavaScript(ast.test.expression)
                    : emitJavaScript(ast.test);
        } else {
            result += "0";
        }

        result += "; __repeat_count > 0; __repeat_count--)";

        // Handle body
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        return result;
    }

    // Handle switch statement
    if (ast.type === "SwitchStatement") {
        let result = "switch ";

        // Handle discriminant
        if (ast.discriminant) {
            result +=
                ast.discriminant.type === "ParenthesizedExpression"
                    ? `(${emitJavaScript(ast.discriminant.expression)})`
                    : `(${emitJavaScript(ast.discriminant)})`;
        }

        result += " {\n";

        // Handle cases
        if (ast.cases && ast.cases.length > 0) {
            result += ast.cases
                .map((caseNode) => {
                    let caseStr = "";
                    caseStr =
                        caseNode.test === null
                            ? "default:\n"
                            : `case ${emitJavaScript(caseNode.test)}:\n`;

                    // Handle case body
                    if (caseNode.body && caseNode.body.length > 0) {
                        caseStr += caseNode.body
                            .map((stmt) => {
                                const code = emitJavaScript(stmt);
                                // Add semicolon if not already present and not a break/continue/return
                                if (
                                    code &&
                                    !code.endsWith(";") &&
                                    !code.endsWith("}") &&
                                    code !== "break" &&
                                    code !== "continue" &&
                                    !code.startsWith("return")
                                ) {
                                    return code + ";";
                                }
                                return code;
                            })
                            .filter(Boolean)
                            .join("\n");
                    }

                    return caseStr;
                })
                .join("\n");
        }

        result += "\n}";
        return result;
    }

    // Handle variable declarations
    if (ast.type === "VariableDeclaration") {
        const declarations = ast.declarations
            .map((decl) => {
                let result = emitJavaScript(decl.id);
                if (decl.init) {
                    result += ` = ${emitJavaScript(decl.init)}`;
                }
                return result;
            })
            .join(", ");
        return `${ast.kind} ${declarations}`;
    }

    if (ast.type === "VariableDeclarator") {
        let result = emitJavaScript(ast.id);
        if (ast.init) {
            result += ` = ${emitJavaScript(ast.init)}`;
        }
        return result;
    }

    // Handle parenthesized expressions
    if (ast.type === "ParenthesizedExpression") {
        return `(${emitJavaScript(ast.expression)})`;
    }

    // Handle array literals
    if (ast.type === "ArrayExpression") {
        if (!ast.elements || ast.elements.length === 0) {
            return "[]";
        }
        const elements = ast.elements.map(emitJavaScript).join(", ");
        return `[${elements}]`;
    }

    // Handle struct literals (convert to JavaScript object literals)
    if (ast.type === "StructExpression") {
        if (!ast.properties || ast.properties.length === 0) {
            return "{}";
        }
        const properties = ast.properties
            .map((prop) => {
                const key = prop.name;
                const value = emitJavaScript(prop.value);
                return `${key}: ${value}`;
            })
            .join(", ");
        return `{${properties}}`;
    }

    // Default: return empty string for unsupported nodes
    return "";
}
