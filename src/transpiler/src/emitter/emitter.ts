import { builtInFunctions } from "./builtins.js";
import type {
    ArrayExpressionNode,
    AssignmentExpressionNode,
    BinaryExpressionNode,
    BlockStatementNode,
    CallExpressionNode,
    DefaultParameterNode,
    DoUntilStatementNode,
    EmitOptions,
    EnumDeclarationNode,
    EnumMemberNode,
    FunctionDeclarationNode,
    ForStatementNode,
    GmlNode,
    GlobalVarStatementNode,
    IdentifierMetadata,
    IdentifierNode,
    IfStatementNode,
    IncDecStatementNode,
    LiteralNode,
    MemberDotExpressionNode,
    MemberIndexExpressionNode,
    ProgramNode,
    RepeatStatementNode,
    ReturnStatementNode,
    SemOracle,
    StructExpressionNode,
    StructPropertyNode,
    SwitchStatementNode,
    ThrowStatementNode,
    TemplateStringExpressionNode,
    TemplateStringTextNode,
    TernaryExpressionNode,
    TryStatementNode,
    VariableDeclarationNode,
    VariableDeclaratorNode,
    WhileStatementNode,
    WithStatementNode,
    UnaryExpressionNode
} from "./ast.js";

type StatementLike = GmlNode | undefined | null;

const DEFAULT_OPTIONS: EmitOptions = Object.freeze({
    globalsIdent: "global",
    callScriptIdent: "__call_script"
});

const STATEMENT_KEYWORDS = [
    "if",
    "for",
    "while",
    "switch",
    "try",
    "with",
    "do"
]; // heuristics for auto-semicolon insertion

export class GmlToJsEmitter {
    private readonly sem: SemOracle;
    private readonly options: EmitOptions;
    private readonly globalVars: Set<string>;

    constructor(sem: SemOracle, options: Partial<EmitOptions> = {}) {
        this.sem = sem;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.globalVars = new Set();
    }

    emit(ast: StatementLike): string {
        if (!ast) {
            return "";
        }
        return this.visit(ast);
    }

    private visit(ast: GmlNode): string {
        switch (ast.type) {
            case "DefaultParameter": {
                return this.visitDefaultParameter(ast);
            }
            case "Literal": {
                return this.visitLiteral(ast);
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
            case "TemplateStringExpression": {
                return this.visitTemplateStringExpression(ast);
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

    private visitDefaultParameter(ast: DefaultParameterNode): string {
        if (!ast.right) {
            return this.visit(ast.left);
        }
        return `${this.visit(ast.left)} = ${this.visit(ast.right)}`;
    }

    private visitLiteral(ast: LiteralNode): string {
        return String(ast.value);
    }

    private visitIdentifier(ast: IdentifierNode): string {
        const kind = this.sem.kindOfIdent(ast);
        const name = this.sem.nameOfIdent(ast);
        if (this.globalVars.has(name)) {
            return `${this.options.globalsIdent}.${name}`;
        }
        switch (kind) {
            case "self_field": {
                return `self.${name}`;
            }
            case "other_field": {
                return `other.${name}`;
            }
            case "global_field": {
                return `${this.options.globalsIdent}.${name}`;
            }
            default: {
                return name;
            }
        }
    }

    private visitBinaryExpression(ast: BinaryExpressionNode): string {
        const left = this.visit(ast.left);
        const right = this.visit(ast.right);
        const op = this.mapOperator(ast.operator);
        return `(${left} ${op} ${right})`;
    }

    private visitUnaryExpression(ast: UnaryExpressionNode): string {
        const operand = this.visit(ast.argument);
        const op = this.mapUnaryOperator(ast.operator);
        if (ast.argument.type === "Literal") {
            return `${op}${operand}`;
        }
        return ast.prefix === false ? `(${operand})${op}` : `${op}(${operand})`;
    }

    private visitAssignmentExpression(ast: AssignmentExpressionNode): string {
        const left = this.visit(ast.left);
        const right = this.visit(ast.right);
        return `${left} ${ast.operator} ${right}`;
    }

    private visitIncDecStatement(ast: IncDecStatementNode): string {
        const argument = this.visit(ast.argument);
        return ast.prefix
            ? `${ast.operator}${argument}`
            : `${argument}${ast.operator}`;
    }

    private visitMemberIndexExpression(ast: MemberIndexExpressionNode): string {
        const object = this.visit(ast.object);
        const indices = (ast.property ?? [])
            .map((prop) => `[${this.visit(prop)}]`)
            .join("");
        return `${object}${indices}`;
    }

    private visitMemberDotExpression(ast: MemberDotExpressionNode): string {
        const object = this.visit(ast.object);
        const property = this.visit(ast.property);
        return `${object}.${property}`;
    }

    private visitCallExpression(ast: CallExpressionNode): string {
        const callee = this.visit(ast.object);
        const args = ast.arguments.map((arg) => this.visit(arg));
        const kind = this.sem.callTargetKind(ast);

        if (kind === "builtin") {
            const builtinName = this.resolveIdentifierName(ast.object);
            if (builtinName) {
                const emitter = builtInFunctions[builtinName];
                if (emitter) {
                    return emitter(args);
                }
            }
        }

        if (kind === "script") {
            const scriptSymbol = this.sem.callTargetSymbol(ast);
            const fallbackName =
                this.resolveIdentifierName(ast.object) ?? callee;
            const scriptId = scriptSymbol ?? fallbackName;
            const argsList = args.join(", ");
            return `${this.options.callScriptIdent}(${JSON.stringify(
                scriptId
            )}, self, other, [${argsList}])`;
        }

        return `${callee}(${args.join(", ")})`;
    }

    private visitProgram(ast: ProgramNode): string {
        return (ast.body ?? [])
            .map((stmt) => this.ensureStatementTermination(this.visit(stmt)))
            .filter(Boolean)
            .join("\n");
    }

    private visitBlockStatement(ast: BlockStatementNode): string {
        const body = (ast.body ?? [])
            .map((stmt) => this.ensureStatementTermination(this.visit(stmt)))
            .filter(Boolean)
            .join("\n");
        return `{\n${body}\n}`;
    }

    private visitIfStatement(ast: IfStatementNode): string {
        const test = this.wrapConditional(ast.test);
        const consequent = this.wrapConditionalBody(ast.consequent);
        if (!ast.alternate) {
            return `if ${test}${consequent}`;
        }
        const alternate =
            ast.alternate.type === "IfStatement"
                ? ` else ${this.visit(ast.alternate)}`
                : ` else ${this.wrapConditionalBody(ast.alternate)}`;
        return `if ${test}${consequent}${alternate}`;
    }

    private visitForStatement(ast: ForStatementNode): string {
        const init = ast.init ? this.visit(ast.init) : "";
        const test = ast.test ? this.visit(ast.test) : "";
        const update = ast.update ? this.visit(ast.update) : "";
        const body = this.wrapConditionalBody(ast.body);
        return `for (${init}; ${test}; ${update})${body}`;
    }

    private visitWhileStatement(ast: WhileStatementNode): string {
        const test = this.wrapConditional(ast.test);
        const body = this.wrapConditionalBody(ast.body);
        return `while ${test}${body}`;
    }

    private visitDoUntilStatement(ast: DoUntilStatementNode): string {
        const testExpr = this.wrapConditional(ast.test, true);
        const body = this.wrapConditionalBody(ast.body);
        return `do${body} while (!(${testExpr}))`;
    }

    private visitWithStatement(ast: WithStatementNode): string {
        const testExpr = this.wrapConditional(ast.test, true) || "undefined";
        const rawBody = this.wrapRawBody(ast.body);
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

    private visitReturnStatement(ast: ReturnStatementNode): string {
        if (ast.argument) {
            return `return ${this.visit(ast.argument)}`;
        }
        return "return";
    }

    private visitThrowStatement(ast: ThrowStatementNode): string {
        if (ast.argument) {
            return `throw ${this.visit(ast.argument)}`;
        }
        return "throw";
    }

    private visitTryStatement(ast: TryStatementNode): string {
        const block = this.wrapConditionalBody(ast.block);
        const handler = ast.handler
            ? ` catch (${ast.handler.param ? this.visit(ast.handler.param) : "err"})${this.wrapConditionalBody(ast.handler.body)}`
            : "";
        const finalizer = ast.finalizer
            ? ` finally${this.wrapConditionalBody(ast.finalizer.body)}`
            : "";
        return `try${block}${handler}${finalizer}`;
    }

    private visitRepeatStatement(ast: RepeatStatementNode): string {
        const testExpr = this.wrapConditional(ast.test, true) || "0";
        const body = this.wrapConditionalBody(ast.body);
        return `for (let __repeat_count = ${testExpr}; __repeat_count > 0; __repeat_count--)${body}`;
    }

    private visitSwitchStatement(ast: SwitchStatementNode): string {
        const discriminant = this.wrapConditional(ast.discriminant);
        const cases = (ast.cases ?? [])
            .map((caseNode) => {
                const header =
                    caseNode.test === null
                        ? "default:"
                        : `case ${this.visit(caseNode.test)}:`;
                const body = (caseNode.body ?? [])
                    .map((stmt) => {
                        const code = this.visit(stmt);
                        const trimmed = code.trim();
                        if (
                            !code ||
                            code.endsWith(";") ||
                            code.endsWith("}") ||
                            trimmed === "break" ||
                            trimmed === "continue" ||
                            trimmed.startsWith("return")
                        ) {
                            return code;
                        }
                        return `${code};`;
                    })
                    .filter(Boolean)
                    .join("\n");
                return `${header}\n${body}`;
            })
            .join("\n");
        return `switch ${discriminant} {\n${cases}\n}`;
    }

    private visitGlobalVarStatement(ast: GlobalVarStatementNode): string {
        if (!ast.declarations || ast.declarations.length === 0) {
            return "";
        }
        return ast.declarations
            .map((decl) => {
                const identifier = this.resolveIdentifierName(decl.id);
                if (!identifier) {
                    return "";
                }
                this.globalVars.add(identifier);
                return `if (!Object.prototype.hasOwnProperty.call(globalThis, "${identifier}")) { globalThis.${identifier} = undefined; }`;
            })
            .filter(Boolean)
            .join("\n");
    }

    private visitVariableDeclaration(ast: VariableDeclarationNode): string {
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

    private visitVariableDeclarator(ast: VariableDeclaratorNode): string {
        let result = this.visit(ast.id);
        if (ast.init) {
            result += ` = ${this.visit(ast.init)}`;
        }
        return result;
    }

    private visitTernaryExpression(ast: TernaryExpressionNode): string {
        const test = this.wrapConditional(ast.test, true);
        const consequent = this.visit(ast.consequent);
        const alternate = this.visit(ast.alternate);
        return `(${test} ? ${consequent} : ${alternate})`;
    }

    private visitArrayExpression(ast: ArrayExpressionNode): string {
        if (!ast.elements || ast.elements.length === 0) {
            return "[]";
        }
        const elements = ast.elements.map((el) => this.visit(el)).join(", ");
        return `[${elements}]`;
    }

    private visitTemplateStringExpression(
        ast: TemplateStringExpressionNode
    ): string {
        const parts = (ast.atoms ?? []).map((atom) => {
            if (!atom) {
                return "";
            }
            if (atom.type === "TemplateStringText") {
                return this.escapeTemplateText(atom);
            }
            return `\${${this.visit(atom)}}`;
        });
        return `\`${parts.join("")}\``;
    }

    private visitStructExpression(ast: StructExpressionNode): string {
        if (!ast.properties || ast.properties.length === 0) {
            return "{}";
        }
        const properties = ast.properties
            .map((prop) => {
                const key = this.resolveStructKey(prop);
                const value = this.visit(prop.value);
                return `${key}: ${value}`;
            })
            .join(", ");
        return `{${properties}}`;
    }

    private visitEnumDeclaration(ast: EnumDeclarationNode): string {
        const name = this.visit(ast.name);
        const lines = [
            `const ${name} = (() => {`,
            "    const __enum = {};",
            "    let __value = -1;"
        ];
        for (const member of ast.members ?? []) {
            const memberName = this.resolveEnumMemberName(member);
            if (
                member.initializer !== undefined &&
                member.initializer !== null
            ) {
                const initializer =
                    typeof member.initializer === "string" ||
                    typeof member.initializer === "number"
                        ? String(member.initializer)
                        : this.visit(member.initializer);
                lines.push(`    __value = ${initializer};`);
            } else {
                lines.push("    __value += 1;");
            }
            lines.push(`    __enum.${memberName} = __value;`);
        }
        lines.push("    return __enum;", "})();");
        return lines.join("\n");
    }

    private visitFunctionDeclaration(ast: FunctionDeclarationNode): string {
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
        result += this.wrapConditionalBody(ast.body);
        return result;
    }

    public mapOperator(op: string): string {
        const mapping: Record<string, string> = {
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
        return mapping[op] ?? op;
    }

    public mapUnaryOperator(op: string): string {
        const mapping: Record<string, string> = {
            not: "!",
            "~": "~",
            "-": "-",
            "+": "+"
        };
        return mapping[op] ?? op;
    }

    private wrapConditional(
        node: GmlNode | null | undefined,
        raw = false
    ): string {
        if (!node) {
            return raw ? "" : "(undefined)";
        }
        const expression =
            node.type === "ParenthesizedExpression"
                ? this.visit(node.expression)
                : this.visit(node);
        return raw ? expression : `(${expression})`;
    }

    private wrapConditionalBody(node: GmlNode | null | undefined): string {
        if (!node) {
            return " {\n}\n";
        }
        if (node.type === "BlockStatement") {
            return ` ${this.visit(node)}`;
        }
        let statement = this.visit(node);
        if (statement && !statement.trim().endsWith(";")) {
            statement += ";";
        }
        return ` {\n${statement}\n}`;
    }

    private wrapRawBody(node: GmlNode | null | undefined): string {
        if (!node) {
            return "{\n}\n";
        }
        if (node.type === "BlockStatement") {
            return this.visit(node);
        }
        let statement = this.visit(node);
        if (statement && !statement.trim().endsWith(";")) {
            statement += ";";
        }
        return `\n{\n${statement}\n}`.trim();
    }

    private ensureStatementTermination(code: string): string {
        if (!code) {
            return "";
        }
        const trimmed = code.trimStart();
        if (
            code.endsWith(";") ||
            code.endsWith("}") ||
            STATEMENT_KEYWORDS.some((keyword) => trimmed.startsWith(keyword))
        ) {
            return code;
        }
        return `${code};`;
    }

    private resolveIdentifierName(
        node: GmlNode | IdentifierMetadata | null | undefined
    ): string | null {
        if (!node) {
            return null;
        }
        if (typeof (node as IdentifierMetadata).name === "string") {
            return (node as IdentifierMetadata).name;
        }
        if ((node as GmlNode).type === "Identifier") {
            return this.sem.nameOfIdent(node as IdentifierNode);
        }
        return null;
    }

    private resolveStructKey(prop: StructPropertyNode): string {
        if (typeof prop.name === "string") {
            return prop.name;
        }
        return this.visit(prop.name);
    }

    private resolveEnumMemberName(member: EnumMemberNode): string {
        if (typeof member.name === "string") {
            return member.name;
        }
        return this.visit(member.name);
    }

    private escapeTemplateText(atom: TemplateStringTextNode): string {
        return atom.value.replaceAll('`', "\\`").replaceAll('${', "\\${");
    }
}

export function emitJavaScript(ast: StatementLike, sem?: SemOracle): string {
    const oracle = sem ?? makeDummyOracle();
    const emitter = new GmlToJsEmitter(oracle);
    return emitter.emit(ast);
}

export function makeDummyOracle(): SemOracle {
    return {
        kindOfIdent(node) {
            if (!node) {
                return "local";
            }
            if (node.isGlobalIdentifier) {
                return "global_field";
            }
            return "local";
        },
        nameOfIdent(node) {
            return node?.name ?? "";
        },
        qualifiedSymbol() {
            return null;
        },
        callTargetKind(node) {
            const calleeName =
                node.object &&
                typeof (node.object as IdentifierMetadata).name === "string"
                    ? (node.object as IdentifierMetadata).name
                    : null;
            if (calleeName && builtInFunctions[calleeName]) {
                return "builtin";
            }
            return "unknown";
        },
        callTargetSymbol() {
            return null;
        }
    };
}
