import GameMakerLanguageParserVisitor from "./generated/GameMakerLanguageParserVisitor.js";
import { getLineBreakCount } from "./gml-parser.js";

export default class GameMakerASTBuilder extends GameMakerLanguageParserVisitor {
    constructor(options) {
        super();
    }

    // add context data to the node
    astNode(ctx, object) {
        object.start = { line: ctx.start.line, index: ctx.start.start };
        if (ctx.stop) {
            object.end = {
                line: ctx.stop.line + getLineBreakCount(ctx.stop.text),
                index: ctx.stop.stop
            };
        } else {
            object.end = {
                line: ctx.start.line + getLineBreakCount(ctx.start.text),
                index: ctx.start.stop
            };
        }

        return object;
    }

    hasTrailingComma(commaList, itemList) {
        return commaList.length > 0 && commaList.length === itemList.length;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#program.
    build(ctx) {
        let body = [];
        if (ctx.statementList() != null) {
            body = this.visit(ctx.statementList());
        }
        const ast = this.astNode(ctx, {
            type: "Program",
            body: body
        });

        return ast;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#statementList.
    visitStatementList(ctx) {
        let statements = ctx.statement();
        let list = [];
        for (let i = 0; i < statements.length; i++) {
            let stmtObject = this.visit(statements[i]);
            if (stmtObject == null) {
                continue;
            }
            list.push(stmtObject);
        }
        return list;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#statement.
    visitStatement(ctx) {
        if (ctx.block() != null) {
            return this.visit(ctx.block());
        }
        if (ctx.ifStatement() != null) {
            return this.visit(ctx.ifStatement());
        }
        if (ctx.variableDeclarationList() != null) {
            return this.visit(ctx.variableDeclarationList());
        }
        if (ctx.assignmentExpression() != null) {
            return this.visit(ctx.assignmentExpression());
        }
        if (ctx.callStatement() != null) {
            return this.visit(ctx.callStatement());
        }
        if (ctx.iterationStatement() != null) {
            return this.visit(ctx.iterationStatement());
        }
        if (ctx.functionDeclaration() != null) {
            return this.visit(ctx.functionDeclaration());
        }
        if (ctx.switchStatement() != null) {
            return this.visit(ctx.switchStatement());
        }
        if (ctx.enumeratorDeclaration() != null) {
            return this.visit(ctx.enumeratorDeclaration());
        }

        if (ctx.incDecStatement() != null) {
            return this.visit(ctx.incDecStatement());
        }
        if (ctx.returnStatement() != null) {
            return this.visit(ctx.returnStatement());
        }
        if (ctx.exitStatement() != null) {
            return this.visit(ctx.exitStatement());
        }
        if (ctx.withStatement() != null) {
            return this.visit(ctx.withStatement());
        }
        if (ctx.continueStatement() != null) {
            return this.visit(ctx.continueStatement());
        }
        if (ctx.breakStatement() != null) {
            return this.visit(ctx.breakStatement());
        }
        if (ctx.throwStatement() != null) {
            return this.visit(ctx.throwStatement());
        }
        if (ctx.tryStatement() != null) {
            return this.visit(ctx.tryStatement());
        }

        if (ctx.globalVarStatement() != null) {
            return this.visit(ctx.globalVarStatement());
        }
        if (ctx.macroStatement() != null) {
            return this.visit(ctx.macroStatement());
        }
        if (ctx.defineStatement() != null) {
            return this.visit(ctx.defineStatement());
        }
        if (ctx.regionStatement() != null) {
            return this.visit(ctx.regionStatement());
        }
        return null;
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

        if (ctx.statement()[1] != null) {
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
            body: this.visit(ctx.statement())
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
        if (ctx.caseClauses() != null) {
            let cases = ctx.caseClauses();
            for (let i = 0; i < cases.length; i++) {
                caseClauses = caseClauses.concat(this.visit(cases[i]));
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
            handler: handler,
            finalizer: finalizer
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#catchProduction.
    visitCatchProduction(ctx) {
        let param = null;
        if (ctx.identifier() != null) {
            param = this.visit(ctx.identifier());
        }
        return this.astNode(ctx, {
            type: "CatchClause",
            param: param,
            body: this.visit(ctx.statement())
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
        return this.astNode(ctx, {
            type: "VariableDeclarator",
            id: this.visit(ctx.identifier()),
            init: initExpr
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#globalVarStatement.
    visitGlobalVarStatement(ctx) {
        return this.astNode(ctx, {
            type: "GlobalVarStatement",
            kind: "globalvar",
            declarations: this.visit(ctx.identifier())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#LValueExpression.
    visitLValueExpression(ctx) {
        let object = this.visit(ctx.lValueStartExpression());

        // accumulate operations
        if (ctx.lValueChainOperator()?.length > 0) {
            const ops = ctx.lValueChainOperator();
            for (let i = 0; i < ops.length; i++) {
                let node = this.visit(ops[i]);
                node.object = object;
                object = node;
            }
        }

        if (ctx.lValueFinalOperator() != null) {
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
            property: this.visit(ctx.identifier())
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
        if (ctx.lValueExpression() != null) {
            return this.visit(ctx.lValueExpression());
        }
        if (ctx.functionDeclaration() != null) {
            return this.visit(ctx.functionDeclaration());
        }
        if (ctx.callableExpression() != null) {
            return this.visit(ctx.callableExpression());
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#expressionSequence.
    visitExpressionSequence(ctx) {
        let expressions = ctx.expression();
        if (expressions.length === 1) {
            return this.visit(expressions[0]);
        } else {
            return this.visit(expressions);
        }
    }

    // Visit a parse tree produced by GameMakerLanguageParser#expressionOrFunction.
    visitExpressionOrFunction(ctx) {
        if (ctx.expression() != null) {
            return this.visit(ctx.expression());
        }
        if (ctx.functionDeclaration() != null) {
            return this.visit(ctx.functionDeclaration());
        }
        if (ctx.expressionOrFunction() != null) {
            return this.visit(ctx.expressionOrFunction());
        }
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

    // Visit a parse tree produced by GameMakerLanguageParser#LogicalAndExpression.
    visitLogicalAndExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "&&",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#LogicalOrExpression.
    visitLogicalOrExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "||",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
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

    // Visit a parse tree produced by GameMakerLanguageParser#EqualityExpression.
    visitEqualityExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "==",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#BitXOrExpression.
    visitBitXOrExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "^",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MultiplicativeExpression.
    visitMultiplicativeExpression(ctx) {
        let operator = null;
        if (ctx.Multiply() != null) {
            operator = ctx.Multiply().getText();
        }
        if (ctx.Divide() != null) {
            operator = ctx.Divide().getText();
        }
        if (ctx.Modulo() != null) {
            operator = ctx.Modulo().getText();
        }
        if (ctx.IntegerDivide() != null) {
            operator = ctx.IntegerDivide().getText();
        }
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: operator,
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#CallExpression.
    visitCallExpression(ctx) {
        return this.visit(ctx.callStatement());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#BitShiftExpression.
    visitBitShiftExpression(ctx) {
        let operator = null;
        if (ctx.RightShiftArithmetic() != null) {
            operator = ctx.RightShiftArithmetic().getText();
        }
        if (ctx.LeftShiftArithmetic() != null) {
            operator = ctx.LeftShiftArithmetic().getText();
        }
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: operator,
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#ParenthesizedExpression.
    visitParenthesizedExpression(ctx) {
        return this.visit(ctx.expression());
    }

    // Visit a parse tree produced by GameMakerLanguageParser#AdditiveExpression.
    visitAdditiveExpression(ctx) {
        let operator = null;
        if (ctx.Plus() != null) {
            operator = ctx.Plus().getText();
        }
        if (ctx.Minus() != null) {
            operator = ctx.Minus().getText();
        }
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: operator,
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#RelationalExpression.
    visitRelationalExpression(ctx) {
        let operator = null;
        if (ctx.LessThan() != null) {
            operator = ctx.LessThan().getText();
        }
        if (ctx.MoreThan() != null) {
            operator = ctx.MoreThan().getText();
        }
        if (ctx.LessThanEquals() != null) {
            operator = ctx.LessThanEquals().getText();
        }
        if (ctx.GreaterThanEquals() != null) {
            operator = ctx.GreaterThanEquals().getText();
        }
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: operator,
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    visitIncDecExpression(ctx) {
        return this.visit(ctx.incDecStatement());
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
            type: "UnaryExpression",
            operator: operator,
            prefix: false,
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
            type: "UnaryExpression",
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
            expression: this.visit(ctx.identifier()),
            arguments: this.visit(ctx.arguments())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#LiteralExpression.
    visitLiteralExpression(ctx) {
        return this.visitChildren(ctx)[0];
    }

    // Visit a parse tree produced by GameMakerLanguageParser#MemberDotExpression.
    visitMemberDotExpression(ctx) {
        return this.astNode(ctx, {
            type: "MemberDotExpression",
            object: this.visit(ctx.expression()[0]),
            property: this.visit(ctx.expression()[1])
        });
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

    // Visit a parse tree produced by GameMakerLanguageParser#BitAndExpression.
    visitBitAndExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "&",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#LogicalXorExpression.
    visitLogicalXorExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "^^",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#BitOrExpression.
    visitBitOrExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "|",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#CoalesceExpression.
    visitCoalesceExpression(ctx) {
        return this.astNode(ctx, {
            type: "BinaryExpression",
            operator: "??",
            left: this.visit(ctx.expression()[0]),
            right: this.visit(ctx.expression()[1])
        });
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
            argList.push(this.astNode(ctx, { type: "MissingOptionalArgument" }));
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
                argList.push(this.astNode(arg, { type: "MissingOptionalArgument" }));
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

        if (ctx.templateStringAtom() != null) {
            atoms = ctx.templateStringAtom();
        }

        for (let i = 0; i < atoms.length; i++) {
            let atom = atoms[i];
            if (atom.expression() != null) {
                atomList.push(this.visit(atom.expression()));
            }
            if (atom.TemplateStringText() != null) {
                atomList.push({
                    type: "TemplateStringText",
                    value: atom.TemplateStringText().getText()
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
            ctx.Comma(), ctx.propertyAssignment()
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
        let params = this.visit(ctx.parameterList());

        if (ctx.Identifier() != null) {
            id = ctx.Identifier().getText();
        }

        const paramListCtx = ctx.parameterList();

        const hasTrailingComma = this.hasTrailingComma(
            paramListCtx.Comma(),
            paramListCtx.parameterArgument()
        );

        if (ctx.constructorClause() != null) {
            return this.astNode(ctx, {
                type: "ConstructorDeclaration",
                id: id,
                params: params,
                parent: this.visit(ctx.constructorClause()),
                body: this.visit(ctx.block()),
                hasTrailingComma: hasTrailingComma
            });
        }

        return this.astNode(ctx, {
            type: "FunctionDeclaration",
            id: id,
            params: params,
            body: this.visit(ctx.block()),
            hasTrailingComma: hasTrailingComma
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

        if (ctx.parameterList() != null) {
            params = this.visit(ctx.parameterList());
            const paramListCtx = ctx.parameterList();
            hasTrailingComma = this.hasTrailingComma(
                paramListCtx.Comma(),
                paramListCtx.parameterArgument()
            );
        }

        return this.astNode(ctx, {
            type: "ConstructorParentClause",
            id: id,
            params: params,
            hasTrailingComma: hasTrailingComma
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#parameterList.
    visitParameterList(ctx) {
        let params = ctx.parameterArgument();
        let paramList = [];
        for (let i = 0; i < params.length; i++) {
            paramList.push(this.visit(params[i]));
        }
        return paramList;
    }

    // Visit a parse tree produced by GameMakerLanguageParser#parameterArgument.
    visitParameterArgument(ctx) {
        if (ctx.expressionOrFunction() != null) {
            return this.astNode(ctx, {
                type: "DefaultParameter",
                left: this.visit(ctx.identifier()),
                right: this.visit(ctx.expressionOrFunction())
            });
        } else {
            return this.visit(ctx.identifier());
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
        return this.astNode(ctx, {
            type: "Identifier",
            name: ctx.getText()
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#enumeratorDeclaration.
    visitEnumeratorDeclaration(ctx) {
        return this.astNode(ctx, {
            type: "EnumDeclaration",
            name: this.visit(ctx.identifier()),
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
            name: this.visit(ctx.identifier()),
            initializer: initializer
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#macroStatement.
    visitMacroStatement(ctx) {
        return this.astNode(ctx, {
            type: "MacroDeclaration",
            name: this.visit(ctx.identifier()),
            tokens: this.visit(ctx.macroToken())
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#macroStatement.
    visitMacroToken(ctx) {
        return ctx.getText();
    }

    // Visit a parse tree produced by GameMakerLanguageParser#defineStatement.
    visitDefineStatement(ctx) {
        return this.astNode(ctx, {
            type: "DefineStatement",
            name: ctx.RegionCharacters().getText()
        });
    }

    // Visit a parse tree produced by GameMakerLanguageParser#regionStatement.
    visitRegionStatement(ctx) {
        let name = null;
        if (ctx.RegionCharacters() != null) {
            name = ctx.RegionCharacters().getText();
        }
        if (ctx.Region() != null) {
            return this.astNode(ctx, {
                type: "RegionStatement",
                name: name
            });
        } else {
            return this.astNode(ctx, {
                type: "EndRegionStatement",
                name: name
            });
        }
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
