import GameMakerLanguageParserVisitor from "./runtime/game-maker-language-parser-visitor.js";
import { getLineBreakCount, getNonEmptyTrimmedString } from "./utils/index.js";
import BinaryExpressionDelegate from "./ast/binary-expression-delegate.js";
import {
    IdentifierRoleTracker,
    IdentifierScopeCoordinator,
    GlobalIdentifierRegistry,
    createIdentifierLocation as buildIdentifierLocation
} from "./identifier-metadata/index.js";

const BINARY_OPERATORS = {
    // Highest Precedence
    // TODO: Track whether `++` is parsed as a prefix or suffix operator. The
    // parser currently funnels both variants through the same precedence entry,
    // which keeps the visitor traversals simple but hides whether the operand
    // should be evaluated before or after the increment. Downstream
    // transformations such as the identifier role tracker and the
    // apply-feather-fixes pipeline depend on that nuance to distinguish between
    // pure reads and reads-with-writeback. The GameMaker manual spells out the
    // differing semantics (https://manual.gamemaker.io/monthly/en/#t=GameMaker_Language%2FGML_Reference%2FOperators%2FIncrement_and_Decrement.htm),
    // so once the builder exposes the mode we should emit richer AST nodes
    // instead of treating them as interchangeable unary operators.
    "++": { prec: 15, assoc: "right", type: "unary" },
    // TODO: Mirror the prefix/suffix tracking described above for the
    // decrement operator so optimizations do not assume `value--` is
    // side-effect free. GameMaker emits different bytecode for the two forms,
    // and losing that distinction risks mis-scheduling hoists or duplicate
    // writes when formatters rewrite identifier usages.
    "--": { prec: 15, assoc: "right", type: "unary" },
    "~": { prec: 14, assoc: "right", type: "unary" },
    "!": { prec: 14, assoc: "right", type: "unary" },
    // "-": { prec: 14, assoc: "left", type: "unary" }, // Negate
    "*": { prec: 13, assoc: "left", type: "arithmetic" },
    "/": { prec: 13, assoc: "left", type: "arithmetic" },
    div: { prec: 13, assoc: "left", type: "arithmetic" },
    "%": { prec: 13, assoc: "left", type: "arithmetic" },
    mod: { prec: 13, assoc: "left", type: "arithmetic" },
    "+": { prec: 12, assoc: "left", type: "arithmetic" }, // Addition
    "-": { prec: 12, assoc: "left", type: "arithmetic" }, // Subtraction
    "<<": { prec: 12, assoc: "left", type: "bitwise" },
    ">>": { prec: 12, assoc: "left", type: "bitwise" },
    "&": { prec: 11, assoc: "left", type: "bitwise" },
    "^": { prec: 10, assoc: "left", type: "bitwise" },
    "|": { prec: 9, assoc: "left", type: "bitwise" },
    "<": { prec: 8, assoc: "left", type: "comparison" },
    "<=": { prec: 8, assoc: "left", type: "comparison" },
    ">": { prec: 8, assoc: "left", type: "comparison" },
    ">=": { prec: 8, assoc: "left", type: "comparison" },
    "==": { prec: 7, assoc: "left", type: "comparison" },
    "!=": { prec: 7, assoc: "left", type: "comparison" },
    "<>": { prec: 7, assoc: "left", type: "comparison" },
    "&&": { prec: 6, assoc: "left", type: "logical" },
    and: { prec: 6, assoc: "left", type: "logical" },
    "||": { prec: 5, assoc: "left", type: "logical" },
    or: { prec: 5, assoc: "left", type: "logical" },
    "??": { prec: 4, assoc: "right", type: "logical" }, // Nullish coalescing
    "*=": { prec: 1, assoc: "right", type: "assign" },
    ":=": { prec: 1, assoc: "right", type: "assign" }, // Equivalent to "=" in GML
    "=": { prec: 1, assoc: "right", type: "assign" },
    "/=": { prec: 1, assoc: "right", type: "assign" },
    "%=": { prec: 1, assoc: "right", type: "assign" },
    "+=": { prec: 1, assoc: "right", type: "assign" },
    "-=": { prec: 1, assoc: "right", type: "assign" },
    "<<=": { prec: 1, assoc: "right", type: "assign" },
    ">>=": { prec: 1, assoc: "right", type: "assign" },
    "&=": { prec: 1, assoc: "right", type: "assign" },
    "^=": { prec: 1, assoc: "right", type: "assign" },
    "|=": { prec: 1, assoc: "right", type: "assign" },
    "??=": { prec: 1, assoc: "right", type: "assign" } // Nullish coalescing assignment
};

const GLOBAL_SCOPE_OVERRIDE_KEYWORD = "global";

/**
 * Identifier metadata helpers previously leaked behind a single catch-all
 * `IdentifierServices` interface that exposed scope, role, global, and location
 * utilities. That wide surface coerced consumers like the AST builder into
 * depending on many behaviours simultaneously, even when they only needed a
 * subset. The helpers below split that contract into cohesive views so callers
 * can wire only the collaborators they require.
 */

/**
 * @typedef {object} IdentifierScopeTools
 * @property {() => boolean} isEnabled
 * @property {(kind: unknown, callback: () => any) => any} withScope
 */

/**
 * @typedef {object} IdentifierRoleTools
 * @property {(role: object | null | undefined, callback: () => any) => any} withIdentifierRole
 * @property {(role: object | null | undefined) => object} cloneRole
 */

/**
 * @typedef {object} IdentifierClassifierTools
 * @property {(name: string | null | undefined, node: unknown) => void} applyRoleToIdentifier
 */

/**
 * @typedef {object} IdentifierGlobalTools
 * @property {(node: unknown) => void} markGlobalIdentifier
 * @property {(node: unknown) => void} applyGlobalFlag
 */

/**
 * @typedef {object} IdentifierLocationTools
 * @property {(token: unknown) => ReturnType<typeof buildIdentifierLocation>} createIdentifierLocation
 */

/**
 * @param {import("./identifier-metadata/index.js").IdentifierScopeAvailability &
 * import("./identifier-metadata/index.js").IdentifierScopeSession} scopeAccess
 * @returns {IdentifierScopeTools}
 */
function createIdentifierScopeTools(scopeAccess) {
    return {
        isEnabled: () => scopeAccess.isEnabled(),
        withScope: (kind, callback) => scopeAccess.withScope(kind, callback)
    };
}

/**
 * @param {IdentifierRoleTracker} roleTracker
 * @returns {IdentifierRoleTools}
 */
function createIdentifierRoleTools(roleTracker) {
    return {
        withIdentifierRole: (role, callback) =>
            roleTracker.withRole(role, callback),
        cloneRole: (role) => roleTracker.cloneRole(role)
    };
}

/**
 * @param {import("./identifier-metadata/index.js").IdentifierRoleApplication} roleApplication
 * @returns {IdentifierClassifierTools}
 */
function createIdentifierClassifierTools(roleApplication) {
    return {
        applyRoleToIdentifier: (name, node) =>
            roleApplication.applyCurrentRoleToIdentifier(name, node)
    };
}

/**
 * @param {GlobalIdentifierRegistry} globalRegistry
 * @returns {IdentifierGlobalTools}
 */
function createIdentifierGlobalTools(globalRegistry) {
    return {
        markGlobalIdentifier: (node) => globalRegistry.markIdentifier(node),
        applyGlobalFlag: (node) => globalRegistry.applyToNode(node)
    };
}

/**
 * @returns {IdentifierLocationTools}
 */
function createIdentifierLocationTools() {
    return {
        createIdentifierLocation: (token) => buildIdentifierLocation(token)
    };
}

/**
 * @param {{
 *     createScopeTracker?: (context: { enabled: boolean }) => unknown,
 *     getIdentifierMetadata?: boolean
 * }} [options]
 */
function createScopeTrackerFromOptions(options = {}) {
    const { createScopeTracker, getIdentifierMetadata } = options;
    if (typeof createScopeTracker !== "function") {
        return null;
    }

    const tracker = createScopeTracker({
        enabled: Boolean(getIdentifierMetadata)
    });

    if (tracker == null) {
        return null;
    }

    if (
        typeof tracker.isEnabled !== "function" ||
        typeof tracker.enterScope !== "function" ||
        typeof tracker.exitScope !== "function" ||
        typeof tracker.declare !== "function" ||
        typeof tracker.reference !== "function"
    ) {
        throw new TypeError(
            "createScopeTracker must return an object implementing the scope tracker interface."
        );
    }

    return tracker;
}

/**
 * Create a parser visitor instance whose generated `visit*` methods proxy to
 * the {@link host}'s implementations. The helper walks the prototype chain so
 * mixins and subclasses can expose custom visit handlers without manually
 * re-binding each method after construction.
 *
 * @param {object} host Instance containing concrete `visit*` methods. Usually a
 *     {@link GameMakerASTBuilder} but accepts any object that implements the
 *     visitor contract.
 * @returns {GameMakerLanguageParserVisitor} Visitor wired to delegate all
 *     method calls back to {@link host}.
 */
function createVisitorDelegate(host) {
    const visitor = new GameMakerLanguageParserVisitor();
    const prototypes = [];

    for (
        let prototype = Object.getPrototypeOf(host);
        prototype && prototype !== Object.prototype;
        prototype = Object.getPrototypeOf(prototype)
    ) {
        prototypes.push(prototype);
    }

    for (const prototype of prototypes) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
            if (name === "constructor" || !name.startsWith("visit")) {
                continue;
            }

            const method = prototype[name];
            if (typeof method !== "function") {
                continue;
            }

            visitor[name] = (...args) => method.apply(host, args);
        }
    }

    return visitor;
}

export default class GameMakerASTBuilder {
    constructor(options = {}, whitespaces = []) {
        this.options = options || {};
        this.whitespaces = whitespaces || [];
        this.operatorStack = [];

        const scopeTracker = createScopeTrackerFromOptions(this.options);
        const roleTracker = new IdentifierRoleTracker();
        const scopeCoordinator = new IdentifierScopeCoordinator({
            scopeTracker,
            roleTracker
        });
        const globalIdentifiers = new Set();
        const globalRegistry = new GlobalIdentifierRegistry({
            globalIdentifiers
        });

        this.scopeTracker = scopeTracker;
        this.identifierRoleTracker = roleTracker;
        this.identifierScopeCoordinator = scopeCoordinator;
        this.globalIdentifiers = globalIdentifiers;
        this.globalIdentifierRegistry = globalRegistry;
        this.identifierScope = createIdentifierScopeTools(scopeCoordinator);
        this.identifierRoles = createIdentifierRoleTools(roleTracker);
        this.identifierClassifier =
            createIdentifierClassifierTools(scopeCoordinator);
        this.identifierGlobals = createIdentifierGlobalTools(globalRegistry);
        this.identifierLocations = createIdentifierLocationTools();

        this.binaryExpressions = new BinaryExpressionDelegate({
            operators: BINARY_OPERATORS
        });

        this.visitor = createVisitorDelegate(this);
        // Defensive wrappers: the generated visitor expects non-null parse
        // contexts. Some parser accessor helpers can return `null` for
        // optional grammar branches. Guard the public `visit` and
        // `visitChildren` delegates so callers can safely pass possibly-null
        // values without triggering `accept` on `null`.
        this.visit = (node) =>
            node !== undefined && node !== null
                ? this.visitor.visit(node)
                : null;
        this.visitChildren = (node) =>
            node !== undefined && node !== null
                ? this.visitor.visitChildren(node)
                : null;
    }

    isIdentifierMetadataEnabled() {
        return this.identifierScope.isEnabled();
    }

    withScope(kind, callback) {
        return this.identifierScope.withScope(kind, callback);
    }

    withIdentifierRole(role, callback) {
        return this.identifierRoles.withIdentifierRole(role, callback);
    }

    cloneRole(role) {
        return this.identifierRoles.cloneRole(role);
    }

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
    visitFirstChild(ctx, methodNames) {
        if (!ctx || !Array.isArray(methodNames)) {
            return null;
        }

        for (const methodName of methodNames) {
            const getter = ctx[methodName];
            if (typeof getter !== "function") {
                continue;
            }

            const child = getter.call(ctx);
            // Some parser accessors may return `null` for absent optional
            // children (or `undefined`). Treat both as "no child" so we do
            // not attempt to visit a null context which would crash the
            // visitor (ctx.accept would be called on null).
            if (child !== undefined && child !== null) {
                return this.visit(child);
            }
        }

        return null;
    }

    // Attach source location metadata (start/end line and offset) to each AST node
    // so downstream tools (formatter, linter, error reporter) can map nodes back to
    // their original source positions. We compute the end location by accounting for
    // line breaks within the token's text, which is crucial for multi-line string
    // literals or block comments that span multiple lines.
    astNode(ctx, object) {
        object.start = { line: ctx.start.line, index: ctx.start.start };
        object.end = ctx.stop
            ? {
                  line: ctx.stop.line + getLineBreakCount(ctx.stop.text),
                  index: ctx.stop.stop
              }
            : {
                  line: ctx.start.line + getLineBreakCount(ctx.start.text),
                  index: ctx.start.stop
              };

        return object;
    }

    astNodeFromToken(token, object) {
        if (token && token.symbol) {
            object.start = {
                line: token.symbol.line,
                index: token.symbol.start
            };
            object.end = {
                line:
                    token.symbol.line +
                    getLineBreakCount(token.symbol.text || ""),
                index: token.symbol.stop
            };
        } else if (token && token.start && token.stop) {
            object.start = {
                line: token.start.line,
                index: token.start.start
            };
            object.end = {
                line:
                    token.stop.line + getLineBreakCount(token.stop.text || ""),
                index: token.stop.stop
            };
        } else {
            // Fallback - use current context if token is invalid
            return this.astNode(this, object);
        }

        return object;
    }

    createIdentifierLocation(token) {
        return this.identifierLocations.createIdentifierLocation(token);
    }

    visitBinaryExpression(ctx) {
        return this.binaryExpressions.handle(ctx, {
            visit: (node) => this.visit(node),
            astNode: (context, value) => this.astNode(context, value)
        });
    }

    hasTrailingComma(commaList, itemList) {
        return commaList.length > 0 && commaList.length === itemList.length;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#program.
    build(ctx) {
        const body = this.withScope("program", () => {
            // Accept null or undefined from the generated runtime for optional
            // productions.
            if (ctx.statementList() != null) {
                return this.visit(ctx.statementList());
            }
            return [];
        });
        return this.astNode(ctx, {
            type: "Program",
            body: body ?? []
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#statementList.
    visitStatementList(ctx) {
        const statements = ctx.statement();
        const list = [];
        for (const statement of statements) {
            const stmtObject = this.visit(statement);
            if (stmtObject == undefined) {
                continue;
            }
            list.push(stmtObject);
        }
        return list;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#statement.
    visitStatement(ctx) {
        return this.visitFirstChild(ctx, [
            "block",
            "ifStatement",
            "variableDeclarationList",
            "assignmentExpression",
            "callStatement",
            "iterationStatement",
            "functionDeclaration",
            "switchStatement",
            "enumeratorDeclaration",
            "incDecStatement",
            "returnStatement",
            "exitStatement",
            "withStatement",
            "continueStatement",
            "breakStatement",
            "throwStatement",
            "tryStatement",
            "globalVarStatement",
            "macroStatement",
            "defineStatement",
            "regionStatement",
            "deleteStatement",
            "literalStatement",
            "identifierStatement",
            "malformedDocComment"
        ]);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#block.
    visitBlock(ctx) {
        if (!ctx.statementList()) {
            return this.astNode(ctx, { type: "BlockStatement", body: [] });
        }
        return this.astNode(ctx, {
            type: "BlockStatement",
            body: this.visit(ctx.statementList())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#ifStatement.
    visitIfStatement(ctx) {
        const test = this.visit(ctx.expression());
        const consequent = this.visit(ctx.statement()[0]);
        let alternate = null;

        if (ctx.statement()[1] != null) {
            alternate = this.visit(ctx.statement()[1]);
        }
        return this.astNode(ctx, {
            type: "IfStatement",
            test,
            consequent,
            alternate
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#DoStatement.
    visitDoStatement(ctx) {
        return this.astNode(ctx, {
            type: "DoUntilStatement",
            body: this.visit(ctx.statement()),
            test: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#WhileStatement.
    visitWhileStatement(ctx) {
        return this.astNode(ctx, {
            type: "WhileStatement",
            test: this.visit(ctx.expression()),
            body: this.visit(ctx.statement())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#ForStatement.
    visitForStatement(ctx) {
        let init = null;
        let test = null;
        let update = null;
        let body = null;

        if (ctx.variableDeclarationList() != null) {
            init = this.visit(ctx.variableDeclarationList());
        } else if (ctx.assignmentExpression() != null) {
            init = this.visit(ctx.assignmentExpression());
        }
        if (ctx.expression() != null) {
            test = this.visit(ctx.expression());
        }
        if (ctx.statement().length > 1) {
            update = this.visit(ctx.statement()[0]);
            body = this.visit(ctx.statement()[1]);
        } else {
            body = this.visit(ctx.statement()[0]);
        }

        return this.astNode(ctx, {
            type: "ForStatement",
            init,
            test,
            update,
            body
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#RepeatStatement.
    visitRepeatStatement(ctx) {
        return this.astNode(ctx, {
            type: "RepeatStatement",
            test: this.visit(ctx.expression()),
            body: this.visit(ctx.statement())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#withStatement.
    visitWithStatement(ctx) {
        return this.astNode(ctx, {
            type: "WithStatement",
            test: this.visit(ctx.expression()),
            body: this.withScope("with", () => this.visit(ctx.statement()))
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#switchStatement.
    visitSwitchStatement(ctx) {
        return this.astNode(ctx, {
            type: "SwitchStatement",
            discriminant: this.visit(ctx.expression()),
            cases: this.visit(ctx.caseBlock())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#continueStatement.
    visitContinueStatement(ctx) {
        return this.astNode(ctx, {
            type: "ContinueStatement"
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#breakStatement.
    visitBreakStatement(ctx) {
        return this.astNode(ctx, {
            type: "BreakStatement"
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#exitStatement.
    visitExitStatement(ctx) {
        return this.astNode(ctx, {
            type: "ExitStatement"
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#emptyStatement.
    visitEmptyStatement(ctx) {
        return this.visitChildren(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#caseBlock.
    visitCaseBlock(ctx) {
        let caseClauses = [];
        // The ANTLR grammar exposes `caseClauses` groups both before and after the
        // optional `default` clause, and each visit returns an array of case nodes.
        // Flatten the arrays as we go so downstream consumers (printers, Feather
        // fixups) continue to receive a single ordered list; skipping the
        // concatenation leaves nested arrays behind and causes switch statements to
        // lose cases during later traversals.
        if (ctx.caseClauses() != null) {
            const cases = ctx.caseClauses();
            for (const case_ of cases) {
                caseClauses = caseClauses.concat(this.visit(case_));
            }
        }
        if (ctx.defaultClause() != null) {
            caseClauses.push(this.visit(ctx.defaultClause()));
        }
        return caseClauses;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#caseClauses.
    visitCaseClauses(ctx) {
        return this.visitChildren(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#caseClause.
    visitCaseClause(ctx) {
        let consequent = null;
        if (ctx.statementList() != null) {
            consequent = this.visit(ctx.statementList());
        }
        return this.astNode(ctx, {
            type: "SwitchCase",
            test: this.visit(ctx.expression()),
            body: consequent
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#defaultClause.
    visitDefaultClause(ctx) {
        let consequent = null;
        if (ctx.statementList() != null) {
            consequent = this.visit(ctx.statementList());
        }
        return this.astNode(ctx, {
            type: "SwitchCase",
            test: null,
            body: consequent
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#throwStatement.
    visitThrowStatement(ctx) {
        return this.astNode(ctx, {
            type: "ThrowStatement",
            argument: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#tryStatement.
    visitTryStatement(ctx) {
        let handler = null;
        let finalizer = null;
        if (ctx.catchProduction() != null) {
            handler = this.visit(ctx.catchProduction());
        }
        if (ctx.finallyProduction() != null) {
            finalizer = this.visit(ctx.finallyProduction());
        }
        return this.astNode(ctx, {
            type: "TryStatement",
            block: this.visit(ctx.statement()),
            handler,
            finalizer
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#catchProduction.
    visitCatchProduction(ctx) {
        let param = null;
        const body = this.withScope("catch", () => {
            if (ctx.identifier() != null) {
                param = this.withIdentifierRole(
                    { type: "declaration", kind: "parameter" },
                    () => this.visit(ctx.identifier())
                );
            }
            return this.visit(ctx.statement());
        });
        return this.astNode(ctx, {
            type: "CatchClause",
            param,
            body
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#finallyProduction.
    visitFinallyProduction(ctx) {
        return this.astNode(ctx, {
            type: "Finalizer",
            body: this.visit(ctx.statement())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#returnStatement.
    visitReturnStatement(ctx) {
        let arg = null;
        if (ctx.expression() != null) {
            arg = this.visit(ctx.expression());
        }
        return this.astNode(ctx, {
            type: "ReturnStatement",
            argument: arg
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#deleteStatement.
    visitDeleteStatement(ctx) {
        return this.astNode(ctx, {
            type: "DeleteStatement",
            operator: "delete",
            argument: this.visit(ctx.expression())
        });
    }

    visitLiteralStatement(ctx) {
        if (!ctx) {
            return null;
        }

        const literalNode = ctx.literal ? ctx.literal() : null;
        let expression = this.visit(literalNode);

        if (typeof expression === "string") {
            expression = this.astNode(literalNode, {
                type: "Literal",
                value: expression
            });
        }

        if (!expression || typeof expression !== "object") {
            return null;
        }

        return this.astNode(ctx, {
            type: "ExpressionStatement",
            expression
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#assignmentExpression.
    visitAssignmentExpression(ctx) {
        return this.astNode(ctx, {
            type: "AssignmentExpression",
            operator: this.visit(ctx.assignmentOperator()),
            left: this.visit(ctx.lValueExpression()),
            right: this.visit(ctx.expressionOrFunction())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#variableDeclarationList.
    visitVariableDeclarationList(ctx) {
        return this.astNode(ctx, {
            type: "VariableDeclaration",
            declarations: this.visit(ctx.variableDeclaration()),
            kind: this.visit(ctx.varModifier())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#varModifier.
    visitVarModifier(ctx) {
        if (ctx.Var().length > 0) {
            return "var";
        }
        if (ctx.Static() != null) {
            return "static";
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#variableDeclaration.
    visitVariableDeclaration(ctx) {
        let initExpr = null;
        if (ctx.expressionOrFunction()) {
            initExpr = this.visit(ctx.expressionOrFunction());
        }
        const id = this.withIdentifierRole(
            { type: "declaration", kind: "variable" },
            () => this.visit(ctx.identifier())
        );
        return this.astNode(ctx, {
            type: "VariableDeclarator",
            id,
            init: initExpr
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#globalVarStatement.
    visitGlobalVarStatement(ctx) {
        const identifierContexts = ctx.identifier();

        const declarations = identifierContexts
            .map((identifierCtx) => {
                const identifier = this.withIdentifierRole(
                    {
                        type: "declaration",
                        kind: "variable",
                        tags: ["global"],
                        scopeOverride: GLOBAL_SCOPE_OVERRIDE_KEYWORD
                    },
                    () => this.visit(identifierCtx)
                );

                if (!identifier) {
                    return null;
                }

                this.identifierGlobals.markGlobalIdentifier(identifier);

                return this.astNode(identifierCtx, {
                    type: "VariableDeclarator",
                    id: identifier,
                    init: null
                });
            })
            .filter((declarator) => declarator !== null);

        if (declarations.length === 0) {
            return null;
        }

        return this.astNode(ctx, {
            type: "GlobalVarStatement",
            declarations,
            kind: "globalvar"
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#LValueExpression.
    visitLValueExpression(ctx) {
        let object = this.visit(ctx.lValueStartExpression());

        // accumulate operations
        if (ctx.lValueChainOperator()?.length > 0) {
            const ops = ctx.lValueChainOperator();
            for (const op of ops) {
                const node = this.visit(op);
                // Some visitor paths may return `null` for malformed or
                // otherwise-absent operator nodes. Guard before assigning so we
                // do not attempt to set properties on `null` and crash the
                // traversal; skip null results and continue accumulating.
                if (node && typeof node === "object") {
                    node.object = object;
                    object = node;
                }
            }
        }

        if (ctx.lValueFinalOperator() != null) {
            const finalOp = this.visit(ctx.lValueFinalOperator());
            if (finalOp && typeof finalOp === "object") {
                finalOp.object = object;
                object = finalOp;
            }
        }

        return object;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#IdentifierLValue.
    visitIdentifierLValue(ctx) {
        return this.visit(ctx.identifier());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#NewLValue.
    visitNewLValue(ctx) {
        return this.visit(ctx.newExpression());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberIndexLValue.
    visitMemberIndexLValue(ctx) {
        return this.astNode(ctx, {
            type: "MemberIndexExpression",
            object: null,
            property: this.visit(ctx.expressionSequence()),
            accessor: this.visit(ctx.accessor())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberDotLValue.
    visitMemberDotLValue(ctx) {
        return this.astNode(ctx, {
            type: "MemberDotExpression",
            object: null,
            property: this.withIdentifierRole(
                { type: "reference", kind: "property" },
                () => this.visit(ctx.identifier())
            )
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#CallLValue.
    visitCallLValue(ctx) {
        return this.astNode(ctx, {
            type: "CallExpression",
            object: null,
            arguments: this.visit(ctx.arguments())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberIndexLValueFinal.
    visitMemberIndexLValueFinal(ctx) {
        return this.visitMemberIndexLValue(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberDotLValueFinal.
    visitMemberDotLValueFinal(ctx) {
        return this.visitMemberDotLValue(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#callableExpression.
    visitCallableExpression(ctx) {
        return this.visitFirstChild(ctx, [
            "lValueExpression",
            "functionDeclaration",
            "callableExpression"
        ]);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#expressionSequence.
    visitExpressionSequence(ctx) {
        return ctx.expression().map((expr) => this.visit(expr));
    }

    // Visit a parse tree produced by GameMakerLanguageParser#expressionOrFunction.
    visitExpressionOrFunction(ctx) {
        return this.visitFirstChild(ctx, [
            "expression",
            "functionDeclaration",
            "expressionOrFunction"
        ]);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#TernaryExpression.
    visitTernaryExpression(ctx) {
        return this.astNode(ctx, {
            type: "TernaryExpression",
            test: this.visit(ctx.expression()[0]),
            consequent: this.visit(ctx.expression()[1]),
            alternate: this.visit(ctx.expression()[2])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#NotExpression.
    visitNotExpression(ctx) {
        return this.astNode(ctx, {
            type: "UnaryExpression",
            operator: "!",
            prefix: true,
            argument: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#UnaryPlusExpression.
    visitUnaryPlusExpression(ctx) {
        return this.astNode(ctx, {
            type: "UnaryExpression",
            operator: "+",
            prefix: true,
            argument: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#UnaryMinusExpression.
    visitUnaryMinusExpression(ctx) {
        return this.astNode(ctx, {
            type: "UnaryExpression",
            operator: "-",
            prefix: true,
            argument: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#CallExpression.
    visitCallExpression(ctx) {
        return this.visit(ctx.callStatement());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#FunctionExpression.
    visitFunctionExpression(ctx) {
        return this.visit(ctx.functionDeclaration());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#ParenthesizedExpression.
    visitParenthesizedExpression(ctx) {
        return this.astNode(ctx, {
            type: "ParenthesizedExpression",
            expression: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#incDecStatement.
    visitIncDecStatement(ctx) {
        if (ctx.preIncDecExpression() != null) {
            const result = this.visit(ctx.preIncDecExpression());
            // The ANTLR grammar models `++i;` statements by reusing the same
            // visitor path as `++i` expressions, so we receive an
            // `IncDecExpression` node here. Re-tag it as an
            // `IncDecStatement` before returning so downstream passes know the
            // increment/decrement consumed an entire statement slot. The
            // printers and Feather compatibility transforms (see
            // `src/plugin/src/ast-transforms/apply-feather-fixes.js`) only look
            // for statement-shaped nodes when deciding whether to emit
            // GameMaker-style semicolons or rewrite postfix updates; leaving
            // the expression tag in place would quietly bypass those guards and
            // reintroduce the very regressions they were added to prevent.
            result.type = "IncDecStatement";
            return result;
        }
        if (ctx.postIncDecExpression() != null) {
            const result = this.visit(ctx.postIncDecExpression());
            // See the note above for the prefix branch: postfix statements also
            // surface as expression nodes and must be re-tagged so the printers,
            // loop-size hoisting logic (`src/plugin/src/printer/loop-size-hoisting.js`),
            // and Feather fixups continue to recognise them as standalone
            // statements instead of loose expressions.
            result.type = "IncDecStatement";
            return result;
        }
        return null;
    }

    visitIncDecExpression(ctx) {
        if (ctx.preIncDecExpression()) {
            return this.visit(ctx.preIncDecExpression());
        } else if (ctx.postIncDecExpression()) {
            return this.visit(ctx.postIncDecExpression());
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PostIncDecExpression.
    visitPostIncDecExpression(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != null) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != null) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecExpression",
            operator,
            prefix: false,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PostIncDecStatement.
    visitPostIncDecStatement(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != null) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != null) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecStatement",
            operator,
            prefix: false,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PreIncDecStatement.
    visitPreIncDecStatement(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != null) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != null) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecStatement",
            operator,
            prefix: true,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PreIncDecExpression.
    visitPreIncDecExpression(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != null) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != null) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecExpression",
            operator,
            prefix: true,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#BitNotExpression.
    visitBitNotExpression(ctx) {
        return this.astNode(ctx, {
            type: "UnaryExpression",
            operator: "~",
            prefix: true,
            argument: this.visit(ctx.expression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#NewExpression.
    visitNewExpression(ctx) {
        return this.astNode(ctx, {
            type: "NewExpression",
            expression: this.withIdentifierRole(
                { type: "reference", kind: "type" },
                () => this.visit(ctx.identifier())
            ),
            arguments: this.visit(ctx.arguments())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#LiteralExpression.
    visitLiteralExpression(ctx) {
        return this.visitChildren(ctx)[0];
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberDotExpression.
    visitMemberDotExpression(ctx) {
        const object = this.visit(ctx.expression()[0]);
        const property = this.withIdentifierRole(
            { type: "reference", kind: "property" },
            () => this.visit(ctx.expression()[1])
        );
        const node = this.astNode(ctx, {
            type: "MemberDotExpression",
            object,
            property
        });

        if (object?.start && typeof object.start.index === "number") {
            node.start = node.start || {};
            node.start.index = object.start.index;
            if (typeof object.start.line === "number") {
                node.start.line = object.start.line;
            }
        }

        return node;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberIndexExpression.
    visitMemberIndexExpression(ctx) {
        return this.astNode(ctx, {
            type: "MemberIndexExpression",
            object: this.visit(ctx.expression()),
            property: this.visit(ctx.expressionSequence()),
            accessor: this.visit(ctx.accessor())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#VariableExpression.
    visitVariableExpression(ctx) {
        return this.visit(ctx.lValueExpression());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#callStatement.
    visitCallStatement(ctx) {
        let object = null;
        if (ctx.callableExpression() != null) {
            object = this.visit(ctx.callableExpression());
        }
        if (ctx.callStatement() != null) {
            object = this.visit(ctx.callStatement());
        }
        return this.astNode(ctx, {
            type: "CallExpression",
            object,
            arguments: this.visit(ctx.arguments())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#accessor.
    visitAccessor(ctx) {
        return ctx.getText();
    }

    // Visit a parse tree produced by GameMakerLanguageParser#arguments.
    visitArguments(ctx) {
        const argList = [];
        const argumentListCtx = ctx.argumentList();
        if (argumentListCtx) {
            const children = argumentListCtx.children;
            const hasLeadingComma =
                Array.isArray(children) &&
                children.length > 0 &&
                typeof children[0]?.getText === "function" &&
                children[0].getText() === ",";

            this.collectArguments(argumentListCtx, argList);

            if (hasLeadingComma) {
                // Use the first comma token for location of the leading missing argument
                const commaToken = children[0];
                argList.unshift(
                    this.astNodeFromToken(commaToken, {
                        type: "MissingOptionalArgument"
                    })
                );
            }
        }
        // check if trailingComma exists
        if (ctx.trailingComma()) {
            // Use the trailing comma context for location of the trailing missing argument
            argList.push(
                this.astNode(ctx.trailingComma(), {
                    type: "MissingOptionalArgument"
                })
            );
        }
        return argList;
    }

    // Helper function to collect arguments recursively from an argumentList
    collectArguments(ctx, argList) {
        for (let i = 0; i < ctx.argument().length; i++) {
            const arg = ctx.argument()[i];
            if (arg.UndefinedLiteral()) {
                argList.push(this.visit(arg));
            } else if (!arg.expressionOrFunction()) {
                // Instead of using the potentially incorrect arg context,
                // we need to look for a comma that might indicate this missing argument.
                // For now, create the missing argument node without relying on incorrect context
                argList.push({
                    type: "MissingOptionalArgument"
                    // We'll let the caller handle location info properly
                    // by reorganizing the arguments based on comma positions
                });
            } else if (arg.expressionOrFunction()) {
                argList.push(this.visit(arg.expressionOrFunction()));
            }
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#assignmentOperator.
    visitAssignmentOperator(ctx) {
        let text = ctx.getText();
        if (text == ":=") {
            text = "=";
        }
        return text;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#literal.
    visitLiteral(ctx) {
        if (ctx.arrayLiteral() != null) {
            return this.visit(ctx.arrayLiteral());
        }
        if (ctx.structLiteral() != null) {
            return this.visit(ctx.structLiteral());
        }
        if (ctx.templateStringLiteral() != null) {
            return this.visit(ctx.templateStringLiteral());
        }
        if (ctx.HexIntegerLiteral() != null || ctx.BinaryLiteral() != null) {
            return ctx.getText();
        }

        const value = ctx.getText();

        return this.astNode(ctx, {
            type: "Literal",
            value
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#templateStringLiteral.
    visitTemplateStringLiteral(ctx) {
        let atoms = [];
        const atomList = [];

        if (ctx.templateStringAtom() != null) {
            atoms = ctx.templateStringAtom();
        }

        for (const atom of atoms) {
            if (atom.expression() != null) {
                atomList.push(this.visit(atom.expression()));
            }
            if (atom.TemplateStringText() != null) {
                const templateText = atom.TemplateStringText();
                const value = templateText.getText();
                const symbol = templateText.symbol;

                atomList.push({
                    type: "TemplateStringText",
                    value,
                    start: {
                        line: symbol?.line ?? 0,
                        index: symbol?.start ?? 0
                    },
                    end: {
                        line: (symbol?.line ?? 0) + getLineBreakCount(value),
                        index: symbol?.stop ?? symbol?.start ?? 0
                    }
                });
            }
        }

        return this.astNode(ctx, {
            type: "TemplateStringExpression",
            atoms: atomList
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#templateStringAtom.
    visitTemplateStringAtom(ctx) {
        this.visitChildren(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#arrayLiteral.
    visitArrayLiteral(ctx) {
        const elemList = ctx.elementList();
        const hasTrailingComma = this.hasTrailingComma(
            elemList.Comma(),
            elemList.expressionOrFunction()
        );
        return this.astNode(ctx, {
            type: "ArrayExpression",
            elements: this.visit(ctx.elementList()),
            hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#elementList.
    visitElementList(ctx) {
        // Accept both `undefined` and `null` as absent children from the
        // generated parser runtime. The runtime sometimes returns `null` for
        // missing optional productions, so use a nullish check here.
        if (ctx.expressionOrFunction() == null) {
            return [];
        }
        return this.visit(ctx.expressionOrFunction());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#structLiteral.
    visitStructLiteral(ctx) {
        let properties = [];
        if (ctx.propertyAssignment().length > 0) {
            properties = this.visit(ctx.propertyAssignment());
        }
        const hasTrailingComma = this.hasTrailingComma(
            ctx.Comma(),
            ctx.propertyAssignment()
        );
        return this.astNode(ctx, {
            type: "StructExpression",
            properties,
            hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#functionDeclaration.
    visitFunctionDeclaration(ctx) {
        let id = null;
        let idLocation = null;

        // Guard against `null` as well as `undefined` from the parser runtime.
        if (ctx.Identifier() != null) {
            const identifierNode = ctx.Identifier();
            id = identifierNode.getText();
            idLocation = this.createIdentifierLocation(identifierNode.symbol);
        }

        const paramListCtx = ctx.parameterList();

        let params = [];

        const hasTrailingComma = paramListCtx
            ? this.hasTrailingComma(
                  paramListCtx.Comma(),
                  paramListCtx.parameterArgument()
              )
            : false;

        const body = this.withScope("function", () => {
            if (paramListCtx != null) {
                params = this.visit(paramListCtx);
            }
            return this.visit(ctx.block());
        });

        // constructorClause may be nullish; accept null and undefined.
        if (ctx.constructorClause() != null) {
            return this.astNode(ctx, {
                type: "ConstructorDeclaration",
                id,
                idLocation,
                params,
                parent: this.visit(ctx.constructorClause()),
                body,
                hasTrailingComma
            });
        }

        return this.astNode(ctx, {
            type: "FunctionDeclaration",
            id,
            idLocation,
            params,
            body,
            hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#constructorClause.
    visitConstructorClause(ctx) {
        let id = null;
        let params = [];
        let hasTrailingComma = false;

        if (ctx.Identifier() != null) {
            id = ctx.Identifier().getText();
        }

        const argsCtx = ctx.arguments?.();
        if (argsCtx != null) {
            params = this.visit(argsCtx);
            hasTrailingComma = Boolean(argsCtx.trailingComma());

            if (hasTrailingComma && params.length > 0) {
                const lastParam = params.at(-1);
                if (lastParam?.type === "MissingOptionalArgument") {
                    params = params.slice(0, -1);
                }
            }
        }

        if (!id && params.length === 0) {
            return null;
        }

        return this.astNode(ctx, {
            type: "ConstructorParentClause",
            id,
            params,
            hasTrailingComma
        });
    }

    visitInheritanceClause(ctx) {
        const id = this.withIdentifierRole(
            { type: "reference", kind: "type" },
            () => this.visit(ctx.identifier())
        );
        const args = ctx.arguments() ? this.visit(ctx.arguments()) : [];

        return this.astNode(ctx, {
            type: "InheritanceClause",
            id,
            arguments: args
        });
    }

    visitStructDeclaration(ctx) {
        const id = this.withIdentifierRole(
            { type: "declaration", kind: "struct" },
            () => this.visit(ctx.identifier())
        );
        const paramListCtx = ctx.parameterList();
        let params = [];
        const body = this.withScope("struct", () => {
            if (paramListCtx != null) {
                params = this.visit(paramListCtx);
            }
            return this.visit(ctx.block());
        });
        const parent = ctx.inheritanceClause()
            ? this.visit(ctx.inheritanceClause())
            : null;

        return this.astNode(ctx, {
            type: "StructDeclaration",
            id,
            params,
            body,
            parent
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#parameterList.
    visitParameterList(ctx) {
        const params = ctx.parameterArgument();
        const paramList = [];
        for (const param of params) {
            paramList.push(this.visit(param));
        }
        return paramList;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#parameterArgument.
    visitParameterArgument(ctx) {
        if (ctx.expressionOrFunction() == undefined) {
            return this.withIdentifierRole(
                { type: "declaration", kind: "parameter" },
                () => this.visit(ctx.identifier())
            );
        } else {
            const left = this.withIdentifierRole(
                { type: "declaration", kind: "parameter" },
                () => this.visit(ctx.identifier())
            );
            return this.astNode(ctx, {
                type: "DefaultParameter",
                left,
                right: this.visit(ctx.expressionOrFunction())
            });
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#propertyAssignment.
    visitPropertyAssignment(ctx) {
        return this.astNode(ctx, {
            type: "Property",
            name: this.visit(ctx.propertyIdentifier()),
            value: this.visit(ctx.expressionOrFunction())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#propertyIdentifier.
    visitPropertyIdentifier(ctx) {
        return ctx.getText();
    }

    // Visit a parse tree produced by GameMakerLanguageParser#identifier.
    visitIdentifier(ctx) {
        const name = ctx.getText();
        const node = this.astNode(ctx, {
            type: "Identifier",
            name
        });
        this.identifierGlobals.applyGlobalFlag(node);
        this.identifierClassifier.applyRoleToIdentifier(name, node);
        return node;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#enumeratorDeclaration.
    visitEnumeratorDeclaration(ctx) {
        const name = this.withIdentifierRole(
            { type: "declaration", kind: "enum" },
            () => this.visit(ctx.identifier())
        );
        return this.astNode(ctx, {
            type: "EnumDeclaration",
            name,
            members: this.visit(ctx.enumeratorList()),
            hasTrailingComma: ctx.enumeratorList().Comma() != null
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#enumeratorList.
    visitEnumeratorList(ctx) {
        return this.visit(ctx.enumerator());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#enumerator.
    visitEnumerator(ctx) {
        let initializer = null;
        if (typeof ctx.expression === "function") {
            const expressionContext = ctx.expression();
            if (expressionContext) {
                initializer = this.visit(expressionContext);
                if (initializer && typeof initializer === "object") {
                    if (initializer.type === "Literal") {
                        initializer = initializer.value;
                    } else {
                        const initializerText = expressionContext.getText();
                        if (typeof initializerText === "string") {
                            initializer._enumInitializerText =
                                initializerText.trim();
                        }
                    }
                }
            }
        }
        if (initializer == null && typeof ctx.IntegerLiteral === "function") {
            const literal = ctx.IntegerLiteral();
            if (literal) {
                initializer = literal.getText();
            }
        }
        if (
            initializer == null &&
            typeof ctx.HexIntegerLiteral === "function"
        ) {
            const literal = ctx.HexIntegerLiteral();
            if (literal) {
                initializer = literal.getText();
            }
        }
        if (initializer == null && typeof ctx.BinaryLiteral === "function") {
            const literal = ctx.BinaryLiteral();
            if (literal) {
                initializer = literal.getText();
            }
        }
        return this.astNode(ctx, {
            type: "EnumMember",
            name: this.withIdentifierRole(
                { type: "declaration", kind: "enum-member" },
                () => this.visit(ctx.identifier())
            ),
            initializer
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#macroStatement.
    visitMacroStatement(ctx) {
        const name = this.withIdentifierRole(
            {
                type: "declaration",
                kind: "macro",
                tags: ["global"],
                scopeOverride: GLOBAL_SCOPE_OVERRIDE_KEYWORD
            },
            () => this.visit(ctx.identifier())
        );
        return this.astNode(ctx, {
            type: "MacroDeclaration",
            name,
            tokens: this.visit(ctx.macroToken())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#macroStatement.
    visitMacroToken(ctx) {
        return ctx.getText();
    }

    // Visit a parse tree produced by GameMakerLanguageParser#defineStatement.
    visitDefineStatement(ctx) {
        const regionCharacters = ctx.RegionCharacters();
        const rawText = regionCharacters ? regionCharacters.getText() : "";
        const trimmed = getNonEmptyTrimmedString(rawText);

        if (!trimmed) {
            return null;
        }

        const regionMatch = rawText.match(/^\s*region\b(.*)$/i);
        if (regionMatch) {
            return this.astNode(ctx, {
                type: "DefineStatement",
                name: rawText,
                replacementDirective: "#region",
                replacementSuffix: regionMatch[1] ?? ""
            });
        }

        const endRegionMatch = rawText.match(
            /^\s*(?:end\s*region|endregion)\b(.*)$/i
        );
        if (endRegionMatch) {
            return this.astNode(ctx, {
                type: "DefineStatement",
                name: rawText,
                replacementDirective: "#endregion",
                replacementSuffix: endRegionMatch[1] ?? ""
            });
        }

        if (/^\s*[A-Za-z_][A-Za-z0-9_]*\b/.test(rawText)) {
            return this.astNode(ctx, {
                type: "DefineStatement",
                name: rawText,
                replacementDirective: "#macro",
                replacementSuffix: rawText
            });
        }

        return null;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#regionStatement.
    visitRegionStatement(ctx) {
        let name = null;
        if (ctx.RegionCharacters() != null) {
            name = ctx.RegionCharacters().getText();
        }
        return ctx.Region() == undefined
            ? this.astNode(ctx, {
                  type: "EndRegionStatement",
                  name
              })
            : this.astNode(ctx, {
                  type: "RegionStatement",
                  name
              });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#identifierStatement.
    visitIdentifierStatement(ctx) {
        return this.astNode(ctx, {
            type: "IdentifierStatement",
            name: this.visit(ctx.identifier())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#keyword.
    visitKeyword(ctx) {
        return this.visitChildren(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#softKeyword.
    visitSoftKeyword(ctx) {
        if (ctx.Constructor() != null) {
            return ctx.Constructor().getText();
        }
        return null;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#propertySoftKeyword.
    visitPropertySoftKeyword(ctx) {
        if (ctx.NoOneLiteral() != null) {
            return ctx.NoOneLiteral().getText();
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#openBlock.
    visitOpenBlock(ctx) {
        return this.visitChildren(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#closeBlock.
    visitCloseBlock(ctx) {
        return this.visitChildren(ctx);
    }

    // Visit a parse tree produced by GameMakerLanguageParser#eos.
    visitEos(ctx) {
        return this.visitChildren(ctx);
    }
}
