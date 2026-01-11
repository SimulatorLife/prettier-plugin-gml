/* eslint-disable max-lines -- Visitor pattern requires comprehensive switch statement; refactoring to separate files would break cohesion */
import { Core } from "@gml-modules/core";
import { builtInFunctions } from "./builtins.js";
import { lowerEnumDeclaration } from "./enum-lowering.js";
import { mapBinaryOperator, mapUnaryOperator } from "./operator-mapping.js";
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
    DefineStatementNode,
    DeleteStatementNode,
    DoUntilStatementNode,
    EmitOptions,
    EndRegionStatementNode,
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
    RegionStatementNode,
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
        semantic:
            | (IdentifierAnalyzer & CallTargetAnalyzer)
            | {
                  identifier: IdentifierAnalyzer;
                  callTarget: CallTargetAnalyzer;
              },
        options: Partial<EmitOptions> = {}
    ) {
        // Support both the new simplified interface (single oracle) and
        // the legacy interface (object with identifier/callTarget properties)
        // for backward compatibility
        if ("identifier" in semantic && "callTarget" in semantic) {
            this.identifierAnalyzer = semantic.identifier;
            this.callTargetAnalyzer = semantic.callTarget;
        } else {
            this.identifierAnalyzer = semantic;
            this.callTargetAnalyzer = semantic;
        }
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
            case "RegionStatement": {
                return this.visitRegionStatement(ast);
            }
            case "EndRegionStatement": {
                return this.visitEndRegionStatement(ast);
            }
            case "DefineStatement": {
                return this.visitDefineStatement(ast);
            }
            default: {
                return this.handleUnknownNode(ast);
            }
        }
    }

    /**
     * Handle AST nodes that don't have explicit visitor methods.
     * This serves as a safety net for unimplemented or unexpected node types.
     *
     * Currently returns an empty string to maintain backward compatibility.
     * In development mode, logs unhandled nodes to help identify gaps in coverage.
     *
     * @param ast - The unhandled AST node
     * @returns Empty string (node is skipped in output)
     */
    private handleUnknownNode(ast: GmlNode): string {
        // In development, log unhandled nodes to help identify gaps in coverage.
        // Use process.env check that tree-shakes in production builds.
        if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
            const nodeType = ast?.type ?? "<unknown>";
            // eslint-disable-next-line no-console -- Development diagnostic logging only
            console.warn(`[GmlToJsEmitter] Unhandled node type: ${nodeType}`);
        }
        return "";
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
        const op = mapBinaryOperator(ast.operator);
        return `(${left} ${op} ${right})`;
    }

    private visitUnaryExpression(ast: UnaryExpressionNode): string {
        const operand = this.visit(ast.argument);
        const op = mapUnaryOperator(ast.operator);
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
                        if (!code) {
                            return code;
                        }
                        // Use the standard termination policy for all statements
                        return this.ensureStatementTermination(code);
                    })
                );
                // Skip empty case bodies (fall-through cases)
                if (!body) {
                    return header;
                }
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- visitNodeHelper accepts unknown and casts internally
            this.visitNodeHelper.bind(this),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- resolveEnumMemberNameHelper accepts unknown and casts internally
            this.resolveEnumMemberNameHelper.bind(this)
        );
    }

    private visitMacroDeclaration(ast: MacroDeclarationNode): string {
        const name = this.visit(ast.name);
        const tokens = ast.tokens ?? [];
        // Join tokens without spaces as they are pre-tokenized by the parser.
        // For example, 'global.config' is tokenized as ['global', '.', 'config']
        const value = tokens.join("");
        return `const ${name} = ${value};`;
    }

    private visitFunctionDeclaration(ast: FunctionDeclarationNode): string {
        const id = ast.id ? (typeof ast.id === "string" ? ast.id : this.visit(ast.id)) : "";
        return this.emitFunctionLike("function", id, ast.params, ast.body);
    }

    private visitConstructorDeclaration(ast: ConstructorDeclarationNode): string {
        const id = ast.id ?? "";
        return this.emitFunctionLike("function", id, ast.params, ast.body);
    }

    /**
     * Visit a RegionStatement node.
     * Region statements are GML preprocessor directives used for code folding
     * in the GameMaker IDE. They have no runtime effect and should not appear
     * in the transpiled JavaScript output.
     *
     * @param ast - The RegionStatement node
     * @returns Empty string (region markers are stripped from output)
     */
    private visitRegionStatement(ast: RegionStatementNode): string {
        // Region statements are preprocessor directives that have no runtime effect.
        // Verify the node type for consistency, then emit nothing.
        return ast.type === "RegionStatement" ? "" : "";
    }

    /**
     * Visit an EndRegionStatement node.
     * EndRegion statements are GML preprocessor directives that close a region block.
     * They have no runtime effect and should not appear in the transpiled JavaScript output.
     *
     * @param ast - The EndRegionStatement node
     * @returns Empty string (endregion markers are stripped from output)
     */
    private visitEndRegionStatement(ast: EndRegionStatementNode): string {
        // EndRegion statements are preprocessor directives that have no runtime effect.
        // Verify the node type for consistency, then emit nothing.
        return ast.type === "EndRegionStatement" ? "" : "";
    }

    /**
     * Visit a DefineStatement node.
     * DefineStatement nodes can represent various preprocessor directives including
     * #region, #endregion, and #macro. Region directives have no runtime effect.
     * Macro directives are already handled separately by MacroDeclaration nodes.
     *
     * @param ast - The DefineStatement node
     * @returns Empty string (preprocessor directives are stripped from output)
     */
    private visitDefineStatement(ast: DefineStatementNode): string {
        // DefineStatement nodes for regions have no runtime effect.
        // Verify the node type for consistency, then emit nothing.
        return ast.type === "DefineStatement" ? "" : "";
    }

    private emitFunctionLike(
        keyword: string,
        id: string,
        params: ReadonlyArray<GmlNode | string>,
        body: GmlNode
    ): string {
        let result = `${keyword} ${id}(`;
        if (params && params.length > 0) {
            const paramList = params.map((param) => (typeof param === "string" ? param : this.visit(param))).join(", ");
            result += paramList;
        }
        result += ")";
        result += this.wrapConditionalBody(body);
        return result;
    }

    /**
     * Maps a GML binary operator to its JavaScript equivalent.
     *
     * @deprecated Use the standalone `mapBinaryOperator` function from operator-mapping.ts instead.
     * This method is kept for backward compatibility but delegates to the extracted module.
     *
     * @param op - The GML binary operator to map
     * @returns The equivalent JavaScript operator
     */
    public mapOperator(op: string): string {
        return mapBinaryOperator(op);
    }

    /**
     * Maps a GML unary operator to its JavaScript equivalent.
     *
     * @deprecated Use the standalone `mapUnaryOperator` function from operator-mapping.ts instead.
     * This method is kept for backward compatibility but delegates to the extracted module.
     *
     * @param op - The GML unary operator to map
     * @returns The equivalent JavaScript operator
     */
    public mapUnaryOperator(op: string): string {
        return mapUnaryOperator(op);
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

export function emitJavaScript(ast: StatementLike, sem?: IdentifierAnalyzer & CallTargetAnalyzer): string {
    const oracle = sem ?? createSemanticOracle();
    const emitter = new GmlToJsEmitter(oracle);
    return emitter.emit(ast);
}

/**
 * Create a minimal dummy oracle for testing or scenarios where semantic
 * analysis is not needed. This oracle has no knowledge of built-ins or
 * scripts and classifies everything as local or unknown.
 *
 * @deprecated Use `createSemanticOracle()` instead for better code
 * generation with proper semantic analysis.
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
