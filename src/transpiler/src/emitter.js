/**
 * GML to JavaScript emitter that handles expressions and statements.
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

        // Map GML-specific operators (like `div`, `mod`, `and`, `or`) to their
        // JavaScript equivalents so the runtime correctly interprets GameMaker's
        // non-standard operators. Without this mapping, GML division operators would
        // fail to parse and logical operators would be treated as identifiers.
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

    // Emit literal values (numbers, strings, booleans) directly to JavaScript.
    // The GML parser already normalizes these to JavaScript-compatible formats,
    // so we pass them through unchanged to avoid introducing unnecessary
    // conversions or risking precision loss in numeric literals.
    if (ast.type === "Literal") {
        return String(ast.value);
    }

    if (ast.type === "Identifier") {
        return ast.name;
    }

    // In GML, a bareword identifier can stand alone as a statement (e.g., calling
    // a parameterless script by name). JavaScript requires explicit parentheses
    // for function calls, but we preserve this as a simple identifier statement
    // and append a semicolon to meet JavaScript's statement termination rules.
    if (ast.type === "IdentifierStatement") {
        return emitJavaScript(ast.name) + ";";
    }

    // Transform binary expressions (arithmetic, logical, comparison) into
    // equivalent JavaScript syntax. Parentheses around each expression ensure
    // operator precedence is preserved when expressions are nested or composed.
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
        // Assignment operators in GML map directly to JavaScript's compound
        // assignment operators (=, +=, -=, etc.), so we emit them unchanged.
        // The surrounding context determines whether this becomes a standalone
        // statement or part of a larger expression.
        return `${left} ${ast.operator} ${right}`;
    }

    if (ast.type === "ExpressionStatement") {
        return emitJavaScript(ast.expression) + ";";
    }

    // Convert GML's bracket-based member access (e.g., `array[0][1]` or
    // `map[? "key"]`) into JavaScript bracket notation. GML allows chaining
    // multiple indices on the same object, so we iterate through the property
    // array and emit consecutive bracket pairs to maintain the access chain.
    if (ast.type === "MemberIndexExpression") {
        const object = emitJavaScript(ast.object);
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

    // Emit function calls in standard JavaScript syntax. GML function calls
    // use the same parenthesized argument list as JavaScript, so we emit the
    // callee followed by its arguments without additional transformations.
    if (ast.type === "CallExpression") {
        const callee = emitJavaScript(ast.object);
        const args = ast.arguments.map(emitJavaScript).join(", ");
        return `${callee}(${args})`;
    }

    // Emit the top-level program node by concatenating all statements with
    // newlines. We append semicolons to non-block statements (those not ending
    // in `}`) to satisfy JavaScript's semicolon insertion rules and prevent
    // runtime errors when statements are adjacent without separators.
    if (ast.type === "Program" && ast.body) {
        return ast.body
            .map((stmt) => {
                const code = emitJavaScript(stmt);
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
                // Append semicolons to non-block statements while skipping control-flow
                // statements (if, for, while) that manage their own braces. This keeps
                // expression and assignment statements properly terminated without adding
                // redundant semicolons after compound statements.
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

    // Transpile GML if-statements into JavaScript if-statements. GML allows both
    // parenthesized and unparenthesized test conditions, so we normalize by
    // always emitting parentheses around the test to match JavaScript's syntax.
    if (ast.type === "IfStatement") {
        let result = "if ";

        // Emit the test condition wrapped in parentheses, unwrapping any redundant
        // ParenthesizedExpression nodes to avoid double-nesting like `((x > 0))`.
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? `(${emitJavaScript(ast.test.expression)})`
                    : `(${emitJavaScript(ast.test)})`;
        }

        // Emit the consequent (the "then" branch), wrapping single statements in
        // braces to ensure consistent block scoping and avoid ambiguity when an
        // `else` clause follows. JavaScript parsers can misassociate else clauses
        // with nested if-statements if braces are omitted.
        if (ast.consequent) {
            if (ast.consequent.type === "BlockStatement") {
                result += ` ${emitJavaScript(ast.consequent)}`;
            } else {
                result += ` {\n${emitJavaScript(ast.consequent)};\n}`;
            }
        }

        // Emit the alternate (the "else" branch) if present. We preserve `else if`
        // chains by avoiding extra braces when the alternate is another
        // IfStatement, while single-statement else branches get wrapped in braces
        // for consistency with the consequent handling above.
        if (ast.alternate) {
            if (ast.alternate.type === "IfStatement") {
                result += ` else ${emitJavaScript(ast.alternate)}`;
            } else if (ast.alternate.type === "BlockStatement") {
                result += ` else ${emitJavaScript(ast.alternate)}`;
            } else {
                result += ` else {\n${emitJavaScript(ast.alternate)};\n}`;
            }
        }

        return result;
    }

    if (ast.type === "ForStatement") {
        let result = "for (";

        // Emit the initializer expression (typically a variable declaration like
        // `var i = 0`). GML allows omitting the init clause, so we leave a blank
        // slot when it's absent to maintain valid JavaScript syntax.
        if (ast.init) {
            result += emitJavaScript(ast.init);
        }
        result += "; ";

        // Emit the test condition (e.g., `i < 10`). Similar to the initializer,
        // this can be omitted in GML, resulting in an infinite loop.
        if (ast.test) {
            result += emitJavaScript(ast.test);
        }
        result += "; ";

        // Emit the update expression (e.g., `i++`), which executes after each
        // iteration. Again, GML permits leaving this blank.
        if (ast.update) {
            result += emitJavaScript(ast.update);
        }
        result += ")";

        // Wrap single-statement bodies in braces to prevent scope leakage and
        // ensure variables declared inside remain local to the loop.
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

        // Emit the test condition in parentheses. GML while-loops and JavaScript
        // while-loops share identical semantics, so we can emit them directly.
        // We unwrap redundant ParenthesizedExpression nodes to keep the output clean.
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? `(${emitJavaScript(ast.test.expression)})`
                    : `(${emitJavaScript(ast.test)})`;
        }

        // Wrap single-statement bodies in braces for consistency with other loops
        // and to ensure proper scoping of any variables declared within the loop.
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

        // Emit the loop body first, since do-until executes at least once before
        // checking the condition. We ensure single statements are wrapped in braces
        // to maintain block-scoped variable declarations.
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        result += " while (";

        // GML's do-until continues looping *until* the condition becomes true,
        // which is the inverse of JavaScript's do-while that loops *while* the
        // condition is true. We negate the test condition with `!(...)` to preserve
        // GML's semantics. Without this negation, loops would exit prematurely or
        // run indefinitely depending on the condition.
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

    // Emit return statements with an optional return value. GML permits bare
    // `return` without an argument, which maps directly to JavaScript's `return`.
    if (ast.type === "ReturnStatement") {
        if (ast.argument) {
            return `return ${emitJavaScript(ast.argument)}`;
        }
        return "return";
    }

    // Break and continue statements share identical semantics between GML and
    // JavaScript, so we emit them unchanged. They terminate or skip the current
    // iteration of the innermost enclosing loop or switch statement.
    if (ast.type === "BreakStatement") {
        return "break";
    }

    if (ast.type === "ContinueStatement") {
        return "continue";
    }

    // Emit throw statements with an exception argument. GML's exception model
    // closely mirrors JavaScript's, allowing any value to be thrown.
    if (ast.type === "ThrowStatement") {
        if (ast.argument) {
            return `throw ${emitJavaScript(ast.argument)}`;
        }
        return "throw";
    }

    // Transpile try-catch-finally blocks, which follow JavaScript's exception
    // handling model. GML permits optional catch and finally clauses, just like
    // JavaScript, so we only emit the clauses that are present in the AST.
    if (ast.type === "TryStatement") {
        let result = "try";

        // Emit the try block containing the code that may throw exceptions. We
        // ensure single-statement try blocks are wrapped in braces since
        // JavaScript syntax requires a block statement here.
        if (ast.block) {
            result +=
                ast.block.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.block)}`
                    : ` {\n${emitJavaScript(ast.block)};\n}`;
        }

        // Emit the catch clause if present, including the exception parameter.
        // GML allows omitting the parameter, so we default to `err` to ensure
        // valid JavaScript syntax and give the exception a named binding.
        if (ast.handler) {
            result += " catch";
            if (ast.handler.param) {
                result += ` (${emitJavaScript(ast.handler.param)})`;
            } else {
                result += " (err)";
            }
            result +=
                ast.handler.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.handler.body)}`
                    : ` {\n${emitJavaScript(ast.handler.body)};\n}`;
        }

        // Emit the finally clause if present. Finally blocks always execute
        // regardless of whether an exception was thrown or caught, making them
        // ideal for cleanup logic like releasing resources.
        if (ast.finalizer) {
            result += " finally";
            result +=
                ast.finalizer.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.finalizer.body)}`
                    : ` {\n${emitJavaScript(ast.finalizer.body)};\n}`;
        }

        return result;
    }

    // GML's `repeat (N) { ... }` construct has no direct JavaScript equivalent,
    // so we transpile it into a counting for-loop that decrements from N to 1.
    // The loop variable `__repeat_count` is prefixed with underscores to avoid
    // colliding with user-defined identifiers in the loop body.
    if (ast.type === "RepeatStatement") {
        let result = "for (let __repeat_count = ";

        // Emit the repeat count expression, which determines how many iterations
        // the loop will execute. If no test expression is provided, we default to
        // 0 to create a loop that never runs (matching GML's behavior).
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? emitJavaScript(ast.test.expression)
                    : emitJavaScript(ast.test);
        } else {
            result += "0";
        }

        result += "; __repeat_count > 0; __repeat_count--)";

        // Emit the loop body, ensuring single statements are wrapped in braces to
        // maintain block scope and prevent the loop variable from leaking.
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        return result;
    }

    // Emit switch statements, which use the same semantics as JavaScript's
    // switch construct. GML's case clauses fall through by default unless
    // terminated by a break, so we emit them directly without modifications.
    if (ast.type === "SwitchStatement") {
        let result = "switch ";

        // Emit the discriminant (the value being switched on), wrapping it in
        // parentheses to match JavaScript's syntax. We unwrap redundant
        // ParenthesizedExpression nodes to avoid double-nesting.
        if (ast.discriminant) {
            result +=
                ast.discriminant.type === "ParenthesizedExpression"
                    ? `(${emitJavaScript(ast.discriminant.expression)})`
                    : `(${emitJavaScript(ast.discriminant)})`;
        }

        result += " {\n";

        // Emit each case clause (including the default clause) along with their
        // bodies. We preserve fall-through behavior by not automatically inserting
        // break statements, leaving that decision to the source GML code.
        if (ast.cases && ast.cases.length > 0) {
            result += ast.cases
                .map((caseNode) => {
                    let caseStr = "";
                    caseStr =
                        caseNode.test === null
                            ? "default:\n"
                            : `case ${emitJavaScript(caseNode.test)}:\n`;

                    // Emit the statements within each case clause, appending semicolons
                    // to expression statements while leaving break, continue, and
                    // return statements unchanged. This ensures proper statement
                    // termination without adding extraneous semicolons to control-flow
                    // keywords that JavaScript treats as complete statements.
                    if (caseNode.body && caseNode.body.length > 0) {
                        caseStr += caseNode.body
                            .map((stmt) => {
                                const code = emitJavaScript(stmt);
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

    // Handle ternary expressions (conditional expressions)
    if (ast.type === "TernaryExpression") {
        const test =
            ast.test.type === "ParenthesizedExpression"
                ? emitJavaScript(ast.test.expression)
                : emitJavaScript(ast.test);
        const consequent = emitJavaScript(ast.consequent);
        const alternate = emitJavaScript(ast.alternate);
        return `(${test} ? ${consequent} : ${alternate})`;
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

    // Handle function declarations
    if (ast.type === "FunctionDeclaration") {
        let result = "function ";

        // Emit the function name. The parser may provide it as a string or as an
        // identifier node, so we handle both cases to support different AST shapes.
        if (ast.id) {
            result +=
                typeof ast.id === "string" ? ast.id : emitJavaScript(ast.id);
        }

        // Emit the parameter list, joining multiple parameters with commas. Like
        // the function name, parameters may be strings or identifier nodes.
        result += "(";
        if (ast.params && ast.params.length > 0) {
            const params = ast.params
                .map((param) =>
                    typeof param === "string" ? param : emitJavaScript(param)
                )
                .join(", ");
            result += params;
        }
        result += ")";

        // Emit the function body, ensuring single-statement bodies are wrapped in
        // braces to satisfy JavaScript's function declaration syntax requirements.
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${emitJavaScript(ast.body)}`
                    : ` {\n${emitJavaScript(ast.body)};\n}`;
        }

        return result;
    }

    // Default: return empty string for unsupported nodes
    return "";
}
