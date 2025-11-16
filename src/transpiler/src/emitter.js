import { builtInFunctions } from "./builtins.js";

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
export function makeDummyOracle() {
    return {
        kindOfIdent(node) {
            if (!node || typeof node !== "object") {
                return "local";
            }

            const name = node.name;

            if (node.isGlobalIdentifier) {
                return "global_field";
            }

            if (name === "self" || name === "other") {
                return "local";
            }

            // A real implementation would check variable declarations.
            // For now, assume it's a local variable unless otherwise specified.
            return "local";
        },
        nameOfIdent(node) {
            return node.name;
        },
        qualifiedSymbol(node) {
            return null;
        },
        callTargetKind(node) {
            if (
                node.object.type === "Identifier" &&
                builtInFunctions[node.object.name]
            ) {
                return "builtin";
            }
            return "unknown";
        },
        callTargetSymbol(node) {
            return null;
        }
    };
}

/**
 * GML to JavaScript emitter that handles expressions and statements.
 * This provides utilities for mapping GML operators to JavaScript.
 */
export class GmlToJsEmitter {
    /**
     * @param {SemOracle} sem
     * @param {object} [options]
     * @param {string} [options.globalsIdent]
     */
    constructor(sem, options = {}) {
        this.sem = sem;
        this.options = {
            globalsIdent: "global",
            callScriptIdent: "__call_script",
            ...options
        };
    }

    /**
     * Emit JavaScript code for a GML AST
     * @param {Object} ast - AST from GML parser
     * @returns {string} Generated JavaScript code
     */
    emit(ast) {
        if (!ast) return "";
        return this.visit(ast);
    }

    visit(ast) {
        if (!ast) return "";

        switch (ast.type) {
            case "Literal": {
                return String(ast.value);
            }
            case "Identifier": {
                return this.visitIdentifier(ast);
            }
            case "IdentifierStatement": {
                return `${this.visit(ast.name)};`;
            }
            case "BinaryExpression": {
                return this.visitBinaryExpression(ast);
            }
            case "UnaryExpression": {
                return this.visitUnaryExpression(ast);
            }
            case "AssignmentExpression": {
                return this.visitAssignmentExpression(ast);
            }
            case "IncDecStatement": {
                return this.visitIncDecStatement(ast);
            }
            case "ExpressionStatement": {
                return `${this.visit(ast.expression)};`;
            }
            case "MemberIndexExpression": {
                return this.visitMemberIndexExpression(ast);
            }
            case "MemberDotExpression": {
                return this.visitMemberDotExpression(ast);
            }
            case "CallExpression": {
                return this.visitCallExpression(ast);
            }
            case "Program": {
                return this.visitProgram(ast);
            }
            case "BlockStatement": {
                return this.visitBlockStatement(ast);
            }
            case "IfStatement": {
                return this.visitIfStatement(ast);
            }
            case "ForStatement": {
                return this.visitForStatement(ast);
            }
            case "WhileStatement": {
                return this.visitWhileStatement(ast);
            }
            case "DoUntilStatement": {
                return this.visitDoUntilStatement(ast);
            }
            case "WithStatement": {
                return this.visitWithStatement(ast);
            }
            case "ReturnStatement": {
                return this.visitReturnStatement(ast);
            }
            case "BreakStatement": {
                return "break";
            }
            case "ContinueStatement": {
                return "continue";
            }
            case "ExitStatement": {
                return "return";
            }
            case "ThrowStatement": {
                return this.visitThrowStatement(ast);
            }
            case "TryStatement": {
                return this.visitTryStatement(ast);
            }
            case "RepeatStatement": {
                return this.visitRepeatStatement(ast);
            }
            case "SwitchStatement": {
                return this.visitSwitchStatement(ast);
            }
            case "GlobalVarStatement": {
                return this.visitGlobalVarStatement(ast);
            }
            case "VariableDeclaration": {
                return this.visitVariableDeclaration(ast);
            }
            case "VariableDeclarator": {
                return this.visitVariableDeclarator(ast);
            }
            case "ParenthesizedExpression": {
                return `(${this.visit(ast.expression)})`;
            }
            case "TernaryExpression": {
                return this.visitTernaryExpression(ast);
            }
            case "ArrayExpression": {
                return this.visitArrayExpression(ast);
            }
            case "StructExpression": {
                return this.visitStructExpression(ast);
            }
            case "EnumDeclaration": {
                return this.visitEnumDeclaration(ast);
            }
            case "FunctionDeclaration": {
                return this.visitFunctionDeclaration(ast);
            }
            default: {
                return "";
            }
        }
    }

    visitIdentifier(ast) {
        const kind = this.sem.kindOfIdent(ast);
        const name = this.sem.nameOfIdent(ast);
        switch (kind) {
            case "local": {
                return name;
            }
            case "self_field": {
                return `self.${name}`;
            }
            case "other_field": {
                return `other.${name}`;
            }
            case "global_field": {
                return `${this.options.globalsIdent}.${name}`;
            }
            case "builtin": {
                // Handle built-in variables if any
                return name;
            }
            case "script": {
                // Handle script references
                return name;
            }
            default: {
                return name;
            }
        }
    }

    visitBinaryExpression(ast) {
        const left = this.visit(ast.left);
        const right = this.visit(ast.right);
        const op = this.mapOperator(ast.operator);
        return `(${left} ${op} ${right})`;
    }

    visitUnaryExpression(ast) {
        const operand = this.visit(ast.argument);
        const op = this.mapUnaryOperator(ast.operator);
        if (ast.argument.type === "Literal") {
            return `${op}${operand}`;
        }
        return ast.prefix === false ? `(${operand})${op}` : `${op}(${operand})`;
    }

    visitAssignmentExpression(ast) {
        const left = this.visit(ast.left);
        const right = this.visit(ast.right);
        return `${left} ${ast.operator} ${right}`;
    }

    visitIncDecStatement(ast) {
        const argument = this.visit(ast.argument);
        if (ast.prefix) {
            return `${ast.operator}${argument}`;
        }
        return `${argument}${ast.operator}`;
    }

    visitMemberIndexExpression(ast) {
        const object = this.visit(ast.object);
        const indices = ast.property
            .map((prop) => `[${this.visit(prop)}]`)
            .join("");
        return `${object}${indices}`;
    }

    visitMemberDotExpression(ast) {
        const object = this.visit(ast.object);
        const property = this.visit(ast.property);
        return `${object}.${property}`;
    }

    visitCallExpression(ast) {
        const callee = this.visit(ast.object);
        const args = ast.arguments.map((arg) => this.visit(arg));
        const kind = this.sem.callTargetKind(ast);

        if (kind === "builtin") {
            return builtInFunctions[ast.object.name](args);
        }

        if (kind === "script") {
            const scriptSymbol = this.sem.callTargetSymbol(ast);
            const fallbackName =
                typeof this.sem.nameOfIdent === "function"
                    ? this.sem.nameOfIdent(ast.object)
                    : (ast.object?.name ?? callee);
            const scriptId = scriptSymbol || fallbackName;
            const argsList = args.join(", ");
            return `${this.options.callScriptIdent}(${JSON.stringify(
                scriptId
            )}, self, other, [${argsList}])`;
        }

        return `${callee}(${args.join(", ")})`;
    }

    visitProgram(ast) {
        if (!ast.body) return "";
        return ast.body
            .map((stmt) => {
                const code = this.visit(stmt);
                if (code && !code.endsWith(";") && !code.endsWith("}")) {
                    return `${code};`;
                }
                return code;
            })
            .filter(Boolean)
            .join("\n");
    }

    visitBlockStatement(ast) {
        if (!ast.body) return "{}";
        const body = ast.body
            .map((stmt) => {
                const code = this.visit(stmt);
                if (
                    code &&
                    !code.endsWith(";") &&
                    !code.endsWith("}") &&
                    !code.trim().startsWith("if") &&
                    !code.trim().startsWith("for") &&
                    !code.trim().startsWith("while")
                ) {
                    return `${code};`;
                }
                return code;
            })
            .filter(Boolean)
            .join("\n");
        return `{\n${body}\n}`;
    }

    visitIfStatement(ast) {
        let result = "if ";
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? `(${this.visit(ast.test.expression)})`
                    : `(${this.visit(ast.test)})`;
        }
        if (ast.consequent) {
            result +=
                ast.consequent.type === "BlockStatement"
                    ? ` ${this.visit(ast.consequent)}`
                    : ` {\n${this.visit(ast.consequent)};\n}`;
        }
        if (ast.alternate) {
            if (ast.alternate.type === "IfStatement") {
                result += ` else ${this.visit(ast.alternate)}`;
            } else if (ast.alternate.type === "BlockStatement") {
                result += ` else ${this.visit(ast.alternate)}`;
            } else {
                result += ` else {\n${this.visit(ast.alternate)};\n}`;
            }
        }
        return result;
    }

    visitForStatement(ast) {
        let result = "for (";
        if (ast.init) {
            result += this.visit(ast.init);
        }
        result += "; ";
        if (ast.test) {
            result += this.visit(ast.test);
        }
        result += "; ";
        if (ast.update) {
            result += this.visit(ast.update);
        }
        result += ")";
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.body)}`
                    : ` {\n${this.visit(ast.body)};\n}`;
        }
        return result;
    }

    visitWhileStatement(ast) {
        let result = "while ";
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? `(${this.visit(ast.test.expression)})`
                    : `(${this.visit(ast.test)})`;
        }
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.body)}`
                    : ` {\n${this.visit(ast.body)};\n}`;
        }
        return result;
    }

    visitDoUntilStatement(ast) {
        let result = "do";
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.body)}`
                    : ` {\n${this.visit(ast.body)};\n}`;
        }
        result += " while (";
        if (ast.test) {
            const testExpr =
                ast.test.type === "ParenthesizedExpression"
                    ? this.visit(ast.test.expression)
                    : this.visit(ast.test);
            result += `!(${testExpr})`;
        }
        result += ")";
        return result;
    }

    visitWithStatement(ast) {
        const testExpr = ast.test
            ? ast.test.type === "ParenthesizedExpression"
                ? this.visit(ast.test.expression)
                : this.visit(ast.test)
            : "undefined";

        const rawBody = (() => {
            if (!ast.body) {
                return "{\n}";
            }
            if (ast.body.type === "BlockStatement") {
                return this.visit(ast.body);
            }
            let statement = this.visit(ast.body);
            if (statement && !statement.trim().endsWith(";")) {
                statement += ";";
            }
            return `{\n${statement}\n}`;
        })();

        const indentedBody = rawBody
            .split("\n")
            .map((line) => (line ? `        ${line}` : ""))
            .join("\n");

        return [
            "{",
            "    const __with_prev_self = self;",
            "    const __with_prev_other = other;",
            `    const __with_value = ${testExpr};`,
            "    const __with_targets = (() => {",
            "        if (",
            '            typeof globalThis.__resolve_with_targets === "function"',
            "        ) {",
            "            return globalThis.__resolve_with_targets(",
            "                __with_value,",
            "                __with_prev_self,",
            "                __with_prev_other",
            "            );",
            "        }",
            "        if (__with_value == null) {",
            "            return [];",
            "        }",
            "        if (Array.isArray(__with_value)) {",
            "            return __with_value;",
            "        }",
            "        return [__with_value];",
            "    })();",
            "    for (",
            "        let __with_index = 0;",
            "        __with_index < __with_targets.length;",
            "        __with_index += 1",
            "    ) {",
            "        const __with_self = __with_targets[__with_index];",
            "        self = __with_self;",
            "        other = __with_prev_self;",
            indentedBody,
            "    }",
            "    self = __with_prev_self;",
            "    other = __with_prev_other;",
            "}"
        ]
            .filter(Boolean)
            .join("\n");
    }

    visitReturnStatement(ast) {
        if (ast.argument) {
            return `return ${this.visit(ast.argument)}`;
        }
        return "return";
    }

    visitThrowStatement(ast) {
        if (ast.argument) {
            return `throw ${this.visit(ast.argument)}`;
        }
        return "throw";
    }

    visitTryStatement(ast) {
        let result = "try";
        if (ast.block) {
            result +=
                ast.block.type === "BlockStatement"
                    ? ` ${this.visit(ast.block)}`
                    : ` {\n${this.visit(ast.block)};\n}`;
        }
        if (ast.handler) {
            result += " catch";
            result += ast.handler.param
                ? ` (${this.visit(ast.handler.param)})`
                : " (err)";
            result +=
                ast.handler.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.handler.body)}`
                    : ` {\n${this.visit(ast.handler.body)};\n}`;
        }
        if (ast.finalizer) {
            result += " finally";
            result +=
                ast.finalizer.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.finalizer.body)}`
                    : ` {\n${this.visit(ast.finalizer.body)};\n}`;
        }
        return result;
    }

    visitRepeatStatement(ast) {
        let result = "for (let __repeat_count = ";
        if (ast.test) {
            result +=
                ast.test.type === "ParenthesizedExpression"
                    ? this.visit(ast.test.expression)
                    : this.visit(ast.test);
        } else {
            result += "0";
        }
        result += "; __repeat_count > 0; __repeat_count--)";
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.body)}`
                    : ` {\n${this.visit(ast.body)};\n}`;
        }
        return result;
    }

    visitSwitchStatement(ast) {
        let result = "switch ";
        if (ast.discriminant) {
            result +=
                ast.discriminant.type === "ParenthesizedExpression"
                    ? `(${this.visit(ast.discriminant.expression)})`
                    : `(${this.visit(ast.discriminant)})`;
        }
        result += " {\n";
        if (ast.cases && ast.cases.length > 0) {
            result += ast.cases
                .map((caseNode) => {
                    let caseStr;
                    caseStr =
                        caseNode.test === null
                            ? "default:\n"
                            : `case ${this.visit(caseNode.test)}:\n`;
                    if (caseNode.body && caseNode.body.length > 0) {
                        caseStr += caseNode.body
                            .map((stmt) => {
                                const code = this.visit(stmt);
                                if (
                                    code &&
                                    !code.endsWith(";") &&
                                    !code.endsWith("}") &&
                                    code !== "break" &&
                                    code !== "continue" &&
                                    !code.startsWith("return")
                                ) {
                                    return `${code};`;
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

    visitGlobalVarStatement(ast) {
        if (!ast.declarations || ast.declarations.length === 0) {
            return "";
        }
        const statements = ast.declarations
            .map((decl) => {
                if (!decl || !decl.id) {
                    return "";
                }
                const identifier =
                    typeof this.sem.nameOfIdent === "function"
                        ? this.sem.nameOfIdent(decl.id)
                        : (decl.id.name ?? decl.id);
                if (!identifier || typeof identifier !== "string") {
                    return "";
                }
                return `if (!Object.prototype.hasOwnProperty.call(globalThis, "${identifier}")) { globalThis.${identifier} = undefined; }`;
            })
            .filter(Boolean);
        return statements.join("\n");
    }

    visitVariableDeclaration(ast) {
        const declarations = ast.declarations
            .map((decl) => {
                let result = this.visit(decl.id);
                if (decl.init) {
                    result += ` = ${this.visit(decl.init)}`;
                }
                return result;
            })
            .join(", ");
        return `${ast.kind} ${declarations}`;
    }

    visitVariableDeclarator(ast) {
        let result = this.visit(ast.id);
        if (ast.init) {
            result += ` = ${this.visit(ast.init)}`;
        }
        return result;
    }

    visitTernaryExpression(ast) {
        const test =
            ast.test.type === "ParenthesizedExpression"
                ? this.visit(ast.test.expression)
                : this.visit(ast.test);
        const consequent = this.visit(ast.consequent);
        const alternate = this.visit(ast.alternate);
        return `(${test} ? ${consequent} : ${alternate})`;
    }

    visitArrayExpression(ast) {
        if (!ast.elements || ast.elements.length === 0) {
            return "[]";
        }
        const elements = ast.elements.map((el) => this.visit(el)).join(", ");
        return `[${elements}]`;
    }

    visitStructExpression(ast) {
        if (!ast.properties || ast.properties.length === 0) {
            return "{}";
        }
        const properties = ast.properties
            .map((prop) => {
                const key = prop.name;
                const value = this.visit(prop.value);
                return `${key}: ${value}`;
            })
            .join(", ");
        return `{${properties}}`;
    }

    visitEnumDeclaration(ast) {
        const name = this.visit(ast.name);
        const lines = [
            `const ${name} = (() => {`,
            "    const __enum = {};",
            "    let __value = -1;"
        ];
        if (ast.members && ast.members.length > 0) {
            for (const member of ast.members) {
                const memberName =
                    typeof member.name === "string"
                        ? member.name
                        : this.visit(member.name);
                if (
                    member.initializer !== undefined &&
                    member.initializer !== null
                ) {
                    const initializer =
                        typeof member.initializer === "string"
                            ? member.initializer
                            : this.visit(member.initializer);
                    lines.push(`    __value = ${initializer};`);
                } else {
                    lines.push("    __value += 1;");
                }
                lines.push(`    __enum.${memberName} = __value;`);
            }
        }
        lines.push("    return __enum;", "})();");
        return lines.join("\n");
    }

    visitFunctionDeclaration(ast) {
        let result = "function ";
        if (ast.id) {
            result += typeof ast.id === "string" ? ast.id : this.visit(ast.id);
        }
        result += "(";
        if (ast.params && ast.params.length > 0) {
            const params = ast.params
                .map((param) =>
                    typeof param === "string" ? param : this.visit(param)
                )
                .join(", ");
            result += params;
        }
        result += ")";
        if (ast.body) {
            result +=
                ast.body.type === "BlockStatement"
                    ? ` ${this.visit(ast.body)}`
                    : ` {\n${this.visit(ast.body)};\n}`;
        }
        return result;
    }

    mapOperator(op) {
        const mapping = {
            div: "/",
            mod: "%",
            and: "&&",
            or: "||",
            xor: "^",
            not: "!",
            "==": "===",
            "!=": "!==",
            "&": "&",
            "|": "|",
            "<<": "<<",
            ">>": ">>"
        };
        return mapping[op] || op;
    }

    mapUnaryOperator(op) {
        const mapping = {
            not: "!",
            "~": "~",
            "-": "-",
            "+": "+"
        };
        return mapping[op] || op;
    }
}

/**
 * Emit JavaScript code for a GML AST
 * @param {Object} ast - AST from GML parser
 * @param {SemOracle} [sem] - Semantic oracle
 * @returns {string} Generated JavaScript code
 */
export function emitJavaScript(ast, sem) {
    const oracle = sem || makeDummyOracle();
    const emitter = new GmlToJsEmitter(oracle);
    return emitter.emit(ast);
}
