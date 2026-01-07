import { Core } from "@gml-modules/core";
import { builtInFunctions } from "./builtins.js";
import { lowerEnumDeclaration } from "./enum-lowering.js";
import { escapeTemplateText, stringifyStructKey } from "./string-utils.js";
import { lowerWithStatement } from "./with-lowering.js";
import type {
    ArrayExpressionNode,
    AssignmentExpressionNode,
    BinaryExpressionNode,
    BlockStatementNode,
    CallExpressionNode,
    CallTargetAnalyzer,
    ConstructorDeclarationNode,
    DefaultParameterNode,
    DeleteStatementNode,
    DoUntilStatementNode,
    EmitOptions,
    EnumDeclarationNode,
    EnumMemberNode,
    FunctionDeclarationNode,
    ForStatementNode,
    GmlNode,
    GlobalVarStatementNode,
    IdentifierAnalyzer,
    IdentifierMetadata,
    IdentifierNode,
    IfStatementNode,
    IncDecStatementNode,
    LiteralNode,
    MacroDeclarationNode,
    MemberDotExpressionNode,
    MemberIndexExpressionNode,
    NewExpressionNode,
    ProgramNode,
    RepeatStatementNode,
    ReturnStatementNode,
    StructExpressionNode,
    StructPropertyNode,
    SwitchStatementNode,
    ThrowStatementNode,
    TemplateStringExpressionNode,
    TernaryExpressionNode,
    TryStatementNode,
    VariableDeclarationNode,
    VariableDeclaratorNode,
    WhileStatementNode,
    WithStatementNode,
    UnaryExpressionNode
} from "./ast.js";
import { createSemanticOracle } from "./semantic-factory.js";
import { evaluateStatementTerminationPolicy } from "./statement-termination-policy.js";

type StatementLike = GmlNode | undefined | null;

const DEFAULT_OPTIONS: EmitOptions = Object.freeze({
    globalsIdent: "global",
    callScriptIdent: "__call_script",
    resolveWithTargetsIdent: "globalThis.__resolve_with_targets"
});

export class GmlToJsEmitter {
    private readonly identifierAnalyzer: IdentifierAnalyzer;
    private readonly callTargetAnalyzer: CallTargetAnalyzer;
    private readonly options: EmitOptions;
    private readonly globalVars: Set<string>;

    constructor(
        semantic: {
            identifier: IdentifierAnalyzer;
            callTarget: CallTargetAnalyzer;
        },
        options: Partial<EmitOptions> = {}
    ) {
        this.identifierAnalyzer = semantic.identifier;
        this.callTargetAnalyzer = semantic.callTarget;
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
            case "NewExpression": {
                return this.visitNewExpression(ast);
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
            case "DeleteStatement": {
                return this.visitDeleteStatement(ast);
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
            case "MacroDeclaration": {
                return this.visitMacroDeclaration(ast);
            }
            case "FunctionDeclaration": {
                return this.visitFunctionDeclaration(ast);
            }
            case "ConstructorDeclaration": {
                return this.visitConstructorDeclaration(ast);
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
        const kind = this.identifierAnalyzer.kindOfIdent(ast);
        const name = this.identifierAnalyzer.nameOfIdent(ast);
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
        return ast.prefix ? `${ast.operator}${argument}` : `${argument}${ast.operator}`;
    }

    private visitMemberIndexExpression(ast: MemberIndexExpressionNode): string {
        const object = this.visit(ast.object);
        const indices = (ast.property ?? []).map((prop) => `[${this.visit(prop)}]`).join("");
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
        const kind = this.callTargetAnalyzer.callTargetKind(ast);

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
            const scriptSymbol = this.callTargetAnalyzer.callTargetSymbol(ast);
            const fallbackName = this.resolveIdentifierName(ast.object) ?? callee;
            const scriptId = scriptSymbol ?? fallbackName;
            const argsList = args.join(", ");
            return `${this.options.callScriptIdent}(${JSON.stringify(scriptId)}, self, other, [${argsList}])`;
        }

        return `${callee}(${args.join(", ")})`;
    }

    private visitNewExpression(ast: NewExpressionNode): string {
        const expression = this.visit(ast.expression);
        const args = (ast.arguments ?? []).map((arg) => this.visit(arg));
        return `new ${expression}(${args.join(", ")})`;
    }

    private visitProgram(ast: ProgramNode): string {
        return this.joinTruthy((ast.body ?? []).map((stmt) => this.ensureStatementTermination(this.emit(stmt))));
    }

    private visitBlockStatement(ast: BlockStatementNode): string {
        const body = this.joinTruthy((ast.body ?? []).map((stmt) => this.ensureStatementTermination(this.emit(stmt))));
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

        return lowerWithStatement(testExpr, indentedBody, this.options.resolveWithTargetsIdent);
    }

    private visitReturnStatement(ast: ReturnStatementNode): string {
        if (ast.argument) {
            return `return ${this.visit(ast.argument)}`;
        }
        return "return";
    }

    private visitDeleteStatement(ast: DeleteStatementNode): string {
        const argument = this.visit(ast.argument);
        return `delete ${argument}`;
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
        const finalizer = ast.finalizer ? ` finally${this.wrapConditionalBody(ast.finalizer.body)}` : "";
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
                const header = caseNode.test === null ? "default:" : `case ${this.visit(caseNode.test)}:`;
                const body = this.joinTruthy(
                    (caseNode.body ?? []).map((stmt) => {
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
                );
                return `${header}\n${body}`;
            })
            .join("\n");
        return `switch ${discriminant} {\n${cases}\n}`;
    }

    private visitGlobalVarStatement(ast: GlobalVarStatementNode): string {
        if (!ast.declarations || ast.declarations.length === 0) {
            return "";
        }
        return this.joinTruthy(
            ast.declarations.map((decl) => {
                const identifier = this.resolveIdentifierName(decl.id);
                if (!identifier) {
                    return "";
                }
                this.globalVars.add(identifier);
                return `if (!Object.prototype.hasOwnProperty.call(globalThis, "${identifier}")) { globalThis.${identifier} = undefined; }`;
            })
        );
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

    private visitTemplateStringExpression(ast: TemplateStringExpressionNode): string {
        const parts = (ast.atoms ?? []).map((atom) => {
            if (!atom) {
                return "";
            }
            if (atom.type === "TemplateStringText") {
                return escapeTemplateText(atom.value);
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
        return lowerEnumDeclaration(
            name,
            ast.members ?? [],
            this.visitNodeHelper.bind(this),
            this.resolveEnumMemberNameHelper.bind(this)
        );
    }

    private visitMacroDeclaration(ast: MacroDeclarationNode): string {
        const name = this.visit(ast.name);
        const tokens = ast.tokens ?? [];
        const value = tokens.join("");
        return `const ${name} = ${value};`;
    }

    private visitFunctionDeclaration(ast: FunctionDeclarationNode): string {
        let result = "function ";
        if (ast.id) {
            result += typeof ast.id === "string" ? ast.id : this.visit(ast.id);
        }
        result += "(";
        if (ast.params && ast.params.length > 0) {
            const params = ast.params
                .map((param) => (typeof param === "string" ? param : this.visit(param)))
                .join(", ");
            result += params;
        }
        result += ")";
        result += this.wrapConditionalBody(ast.body);
        return result;
    }

    private visitConstructorDeclaration(ast: ConstructorDeclarationNode): string {
        let result = "function ";
        if (ast.id) {
            result += ast.id;
        }
        result += "(";
        if (ast.params && ast.params.length > 0) {
            const params = ast.params
                .map((param) => (typeof param === "string" ? param : this.visit(param)))
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

    private wrapConditional(node: GmlNode | null | undefined, raw = false): string {
        if (!node) {
            return raw ? "" : "(undefined)";
        }
        const expression = node.type === "ParenthesizedExpression" ? this.visit(node.expression) : this.visit(node);
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
            return code;
        }

        const { shouldAppendTerminator } = evaluateStatementTerminationPolicy(code);
        if (shouldAppendTerminator) {
            return `${code};`;
        }
        return code;
    }

    private joinTruthy(lines: Array<string | undefined | null | false>): string {
        return Core.compactArray(lines).join("\n");
    }

    private visitNodeHelper(node: unknown): string {
        return this.visit(node as GmlNode);
    }

    private resolveEnumMemberNameHelper(member: EnumMemberNode): string {
        return this.resolveEnumMemberName(member);
    }

    private resolveIdentifierName(node: GmlNode | IdentifierMetadata | null | undefined): string | null {
        if (!node) {
            return null;
        }
        if (typeof (node as IdentifierMetadata).name === "string") {
            return (node as IdentifierMetadata).name;
        }
        if ((node as GmlNode).type === "Identifier") {
            return this.identifierAnalyzer.nameOfIdent(node as IdentifierNode);
        }
        return null;
    }

    private resolveStructKey(prop: StructPropertyNode): string {
        if (typeof prop.name === "string") {
            return stringifyStructKey(prop.name);
        }
        return this.visit(prop.name);
    }

    private resolveEnumMemberName(member: EnumMemberNode): string {
        if (typeof member.name === "string") {
            return member.name;
        }
        return this.visit(member.name);
    }
}

export function emitJavaScript(
    ast: StatementLike,
    sem?: {
        identifier: IdentifierAnalyzer;
        callTarget: CallTargetAnalyzer;
    }
): string {
    const oracle = sem ?? makeDefaultOracle();
    const emitter = new GmlToJsEmitter(oracle);
    return emitter.emit(ast);
}

/**
 * Create a default semantic oracle with full built-in function knowledge.
 * This provides better code generation than the dummy oracle by correctly
 * classifying built-in functions and generating proper SCIP symbols.
 *
 * Use this when you want semantic analysis without a scope tracker or
 * script tracking (suitable for standalone expression/statement transpilation).
 */
export function makeDefaultOracle(): {
    identifier: IdentifierAnalyzer;
    callTarget: CallTargetAnalyzer;
} {
    const oracle = createSemanticOracle();
    return {
        identifier: oracle,
        callTarget: oracle
    };
}

/**
 * Create a minimal dummy oracle for testing or scenarios where semantic
 * analysis is not needed. This oracle has no knowledge of built-ins or
 * scripts and classifies everything as local or unknown.
 *
 * @deprecated Use `makeDefaultOracle()` or `createSemanticOracle()` instead
 * for better code generation with proper semantic analysis.
 */
export function makeDummyOracle(): {
    identifier: IdentifierAnalyzer;
    callTarget: CallTargetAnalyzer;
} {
    const identifierAnalyzer: IdentifierAnalyzer = {
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
        }
    };

    const callTargetAnalyzer: CallTargetAnalyzer = {
        callTargetKind(node) {
            const calleeName =
                node.object && typeof (node.object as IdentifierMetadata).name === "string"
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

    return {
        identifier: identifierAnalyzer,
        callTarget: callTargetAnalyzer
    };
}
