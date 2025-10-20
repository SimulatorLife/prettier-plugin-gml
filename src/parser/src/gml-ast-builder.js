import GameMakerLanguageParserVisitor from "./generated/GameMakerLanguageParserVisitor.js";
import { getLineBreakCount } from "../../shared/utils/line-breaks.js";
import { getNonEmptyTrimmedString } from "../../shared/utils.js";
import ScopeTracker from "./scope-tracker.js";
import { ScopeOverrideKeyword } from "./scope-override-keywords.js";
import BinaryExpressionDelegate from "./binary-expression-delegate.js";
import {
    IdentifierRoleTracker,
    IdentifierScopeCoordinator,
    GlobalIdentifierRegistry,
    createIdentifierLocation as buildIdentifierLocation
} from "./identifier-metadata/index.js";

const BINARY_OPERATORS = {
    // Highest Precedence
    "++": { prec: 15, assoc: "right", type: "unary" }, // TODO: Handle prefix/suffix distinction.
    "--": { prec: 15, assoc: "right", type: "unary" }, // TODO: Handle prefix/suffix distinction.
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

export default class GameMakerASTBuilder extends GameMakerLanguageParserVisitor {
    constructor(options = {}, whitespaces = []) {
        super();
        this.options = options || {};
        this.whitespaces = whitespaces || [];
        this.operatorStack = [];
        this.scopeTracker = new ScopeTracker({
            enabled: Boolean(this.options.getIdentifierMetadata)
        });
        this.identifierRoleTracker = new IdentifierRoleTracker();
        this.identifierScopeCoordinator = new IdentifierScopeCoordinator({
            scopeTracker: this.scopeTracker,
            roleTracker: this.identifierRoleTracker
        });
        this.globalIdentifiers = new Set();
        this.globalIdentifierRegistry = new GlobalIdentifierRegistry({
            globalIdentifiers: this.globalIdentifiers
        });
        this.identifierScope = {
            isEnabled: () => this.identifierScopeCoordinator.isEnabled(),
            withScope: (kind, callback) =>
                this.identifierScopeCoordinator.withScope(kind, callback)
        };
        this.identifierRoles = {
            withIdentifierRole: (role, callback) =>
                this.identifierRoleTracker.withRole(role, callback),
            cloneRole: (role) => this.identifierRoleTracker.cloneRole(role)
        };
        this.identifierClassifier = {
            applyRoleToIdentifier: (name, node) =>
                this.identifierScopeCoordinator.applyCurrentRoleToIdentifier(
                    name,
                    node
                )
        };
        this.identifierGlobals = {
            markGlobalIdentifier: (node) =>
                this.globalIdentifierRegistry.markIdentifier(node),
            applyGlobalFlag: (node) =>
                this.globalIdentifierRegistry.applyToNode(node)
        };
        this.identifierLocations = {
            createIdentifierLocation: (token) => buildIdentifierLocation(token)
        };
        this.binaryExpressions = new BinaryExpressionDelegate({
            operators: BINARY_OPERATORS
        });
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

    // Utility helper that replaces long chains of null checks when visiting
    // optional child contexts. It walks the provided list in order and visits
    // the first available child, mirroring the previous conditional logic
    // without repeating the "if child != null" scaffolding each time.
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
            if (child != undefined) {
                return this.visit(child);
            }
        }

        return null;
    }

    // Add context metadata to the node.
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
            if (ctx.statementList() != undefined) {
                return this.visit(ctx.statementList());
            }
            return [];
        });
        const ast = this.astNode(ctx, {
            type: "Program",
            body: body ?? []
        });

        return ast;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#statementList.
    visitStatementList(ctx) {
        let statements = ctx.statement();
        let list = [];
        for (const statement of statements) {
            let stmtObject = this.visit(statement);
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
            "literalStatement"
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
        let test = this.visit(ctx.expression());
        let consequent = this.visit(ctx.statement()[0]);
        let alternate = null;

        if (ctx.statement()[1] != undefined) {
            alternate = this.visit(ctx.statement()[1]);
        }
        return this.astNode(ctx, {
            type: "IfStatement",
            test: test,
            consequent: consequent,
            alternate: alternate
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

        if (ctx.variableDeclarationList() != undefined) {
            init = this.visit(ctx.variableDeclarationList());
        } else if (ctx.assignmentExpression() != undefined) {
            init = this.visit(ctx.assignmentExpression());
        }
        if (ctx.expression() != undefined) {
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
            init: init,
            test: test,
            update: update,
            body: body
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
        // yucky
        if (ctx.caseClauses() != undefined) {
            let cases = ctx.caseClauses();
            for (const case_ of cases) {
                caseClauses = caseClauses.concat(this.visit(case_));
            }
        }
        if (ctx.defaultClause() != undefined) {
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
        if (ctx.statementList() != undefined) {
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
        if (ctx.statementList() != undefined) {
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
        if (ctx.catchProduction() != undefined) {
            handler = this.visit(ctx.catchProduction());
        }
        if (ctx.finallyProduction() != undefined) {
            finalizer = this.visit(ctx.finallyProduction());
        }
        return this.astNode(ctx, {
            type: "TryStatement",
            block: this.visit(ctx.statement()),
            handler: handler,
            finalizer: finalizer
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#catchProduction.
    visitCatchProduction(ctx) {
        let param = null;
        const body = this.withScope("catch", () => {
            if (ctx.identifier() != undefined) {
                param = this.withIdentifierRole(
                    { type: "declaration", kind: "parameter" },
                    () => this.visit(ctx.identifier())
                );
            }
            return this.visit(ctx.statement());
        });
        return this.astNode(ctx, {
            type: "CatchClause",
            param: param,
            body: body
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
        if (ctx.expression() != undefined) {
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
        if (ctx.Static() != undefined) {
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
            id: id,
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
                        scopeOverride: ScopeOverrideKeyword.GLOBAL
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
                let node = this.visit(op);
                node.object = object;
                object = node;
            }
        }

        if (ctx.lValueFinalOperator() != undefined) {
            let finalOp = this.visit(ctx.lValueFinalOperator());
            finalOp.object = object;
            object = finalOp;
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
        if (ctx.preIncDecExpression() != undefined) {
            let result = this.visit(ctx.preIncDecExpression());
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
        if (ctx.postIncDecExpression() != undefined) {
            let result = this.visit(ctx.postIncDecExpression());
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
        if (ctx.PlusPlus() != undefined) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != undefined) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecExpression",
            operator: operator,
            prefix: false,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PostIncDecStatement.
    visitPostIncDecStatement(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != undefined) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != undefined) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecStatement",
            operator: operator,
            prefix: false,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PreIncDecStatement.
    visitPreIncDecStatement(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != undefined) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != undefined) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecStatement",
            operator: operator,
            prefix: true,
            argument: this.visit(ctx.lValueExpression())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#PreIncDecExpression.
    visitPreIncDecExpression(ctx) {
        let operator = null;
        if (ctx.PlusPlus() != undefined) {
            operator = ctx.PlusPlus().getText();
        }
        if (ctx.MinusMinus() != undefined) {
            operator = ctx.MinusMinus().getText();
        }
        return this.astNode(ctx, {
            type: "IncDecExpression",
            operator: operator,
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
        if (ctx.callableExpression() != undefined) {
            object = this.visit(ctx.callableExpression());
        }
        if (ctx.callStatement() != undefined) {
            object = this.visit(ctx.callStatement());
        }
        return this.astNode(ctx, {
            type: "CallExpression",
            object: object,
            arguments: this.visit(ctx.arguments())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#accessor.
    visitAccessor(ctx) {
        return ctx.getText();
    }

    // Visit a parse tree produced by GameMakerLanguageParser#arguments.
    visitArguments(ctx) {
        let argList = [];
        let argumentListCtx = ctx.argumentList();
        if (argumentListCtx) {
            this.collectArguments(argumentListCtx, argList);
        }
        // check if trailingComma exists
        if (ctx.trailingComma()) {
            argList.push(
                this.astNode(ctx, { type: "MissingOptionalArgument" })
            );
        }
        return argList;
    }

    // Helper function to collect arguments recursively from an argumentList
    collectArguments(ctx, argList) {
        for (let i = 0; i < ctx.argument().length; i++) {
            let arg = ctx.argument()[i];
            if (arg.UndefinedLiteral()) {
                argList.push(this.visit(arg));
            } else if (!arg.expressionOrFunction()) {
                argList.push(
                    this.astNode(arg, { type: "MissingOptionalArgument" })
                );
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
        if (ctx.arrayLiteral() != undefined) {
            return this.visit(ctx.arrayLiteral());
        }
        if (ctx.structLiteral() != undefined) {
            return this.visit(ctx.structLiteral());
        }
        if (ctx.templateStringLiteral() != undefined) {
            return this.visit(ctx.templateStringLiteral());
        }
        if (
            ctx.HexIntegerLiteral() != undefined ||
            ctx.BinaryLiteral() != undefined
        ) {
            return ctx.getText();
        }

        let value = ctx.getText();

        return this.astNode(ctx, {
            type: "Literal",
            value: value
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#templateStringLiteral.
    visitTemplateStringLiteral(ctx) {
        let atoms = [];
        let atomList = [];

        if (ctx.templateStringAtom() != undefined) {
            atoms = ctx.templateStringAtom();
        }

        for (let atom of atoms) {
            if (atom.expression() != undefined) {
                atomList.push(this.visit(atom.expression()));
            }
            if (atom.TemplateStringText() != undefined) {
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
            hasTrailingComma: hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#elementList.
    visitElementList(ctx) {
        if (ctx.expressionOrFunction() == undefined) {
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
            properties: properties,
            hasTrailingComma: hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#functionDeclaration.
    visitFunctionDeclaration(ctx) {
        let id = null;
        let idLocation = null;

        if (ctx.Identifier() != undefined) {
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
            if (paramListCtx != undefined) {
                params = this.visit(paramListCtx);
            }
            return this.visit(ctx.block());
        });

        if (ctx.constructorClause() != undefined) {
            return this.astNode(ctx, {
                type: "ConstructorDeclaration",
                id: id,
                idLocation: idLocation,
                params: params,
                parent: this.visit(ctx.constructorClause()),
                body: body,
                hasTrailingComma: hasTrailingComma
            });
        }

        return this.astNode(ctx, {
            type: "FunctionDeclaration",
            id: id,
            idLocation: idLocation,
            params: params,
            body: body,
            hasTrailingComma: hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#constructorClause.
    visitConstructorClause(ctx) {
        let id = null;
        let params = [];
        let hasTrailingComma = false;

        if (ctx.Identifier() != undefined) {
            id = ctx.Identifier().getText();
        }

        let paramListCtx = ctx.parameterList();
        if (paramListCtx != undefined) {
            params = this.visit(paramListCtx);
            hasTrailingComma = this.hasTrailingComma(
                paramListCtx.Comma(),
                paramListCtx.parameterArgument()
            );
        }

        // Check if neither identifier nor parameterList is present
        if (!id && params.length === 0) {
            return null;
        }

        return this.astNode(ctx, {
            type: "ConstructorParentClause",
            id: id,
            params: params,
            hasTrailingComma: hasTrailingComma
        });
    }

    visitInheritanceClause(ctx) {
        const id = this.withIdentifierRole(
            { type: "reference", kind: "type" },
            () => this.visit(ctx.identifier())
        );
        let args = ctx.arguments() ? this.visit(ctx.arguments()) : [];

        return this.astNode(ctx, {
            type: "InheritanceClause",
            id: id,
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
            if (paramListCtx != undefined) {
                params = this.visit(paramListCtx);
            }
            return this.visit(ctx.block());
        });
        const parent = ctx.inheritanceClause()
            ? this.visit(ctx.inheritanceClause())
            : null;

        return this.astNode(ctx, {
            type: "StructDeclaration",
            id: id,
            params: params,
            body: body,
            parent: parent
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#parameterList.
    visitParameterList(ctx) {
        let params = ctx.parameterArgument();
        let paramList = [];
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
                left: left,
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
            name: name
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
            name: name,
            members: this.visit(ctx.enumeratorList()),
            hasTrailingComma: ctx.enumeratorList().Comma() != undefined
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#enumeratorList.
    visitEnumeratorList(ctx) {
        return this.visit(ctx.enumerator());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#enumerator.
    visitEnumerator(ctx) {
        let initializer = null;
        if (ctx.IntegerLiteral()) {
            initializer = ctx.IntegerLiteral().getText();
        }
        if (ctx.HexIntegerLiteral()) {
            initializer = ctx.HexIntegerLiteral().getText();
        }
        if (ctx.BinaryLiteral()) {
            initializer = ctx.BinaryLiteral().getText();
        }
        return this.astNode(ctx, {
            type: "EnumMember",
            name: this.withIdentifierRole(
                { type: "declaration", kind: "enum-member" },
                () => this.visit(ctx.identifier())
            ),
            initializer: initializer
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#macroStatement.
    visitMacroStatement(ctx) {
        const name = this.withIdentifierRole(
            {
                type: "declaration",
                kind: "macro",
                tags: ["global"],
                scopeOverride: ScopeOverrideKeyword.GLOBAL
            },
            () => this.visit(ctx.identifier())
        );
        return this.astNode(ctx, {
            type: "MacroDeclaration",
            name: name,
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
        if (ctx.RegionCharacters() != undefined) {
            name = ctx.RegionCharacters().getText();
        }
        return ctx.Region() == undefined
            ? this.astNode(ctx, {
                  type: "EndRegionStatement",
                  name: name
              })
            : this.astNode(ctx, {
                  type: "RegionStatement",
                  name: name
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
        if (ctx.Constructor() != undefined) {
            return ctx.Constructor().getText();
        }
        return null;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#propertySoftKeyword.
    visitPropertySoftKeyword(ctx) {
        if (ctx.NoOneLiteral() != undefined) {
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
