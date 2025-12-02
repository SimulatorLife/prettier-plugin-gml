import assert from "node:assert/strict";
import test from "node:test";

import { condenseLogicalExpressions } from "../../../src/transforms/condense-logical-expressions.js";

type CommentNode = {
    readonly type: "CommentLine";
    value: string;
    readonly start?: { index: number };
};

type IdentifierNode = { type: "Identifier"; name: string };

type LiteralNode = { type: "Literal"; value: boolean };

type ReturnStatementNode = {
    type: "ReturnStatement";
    argument: IdentifierNode | LiteralNode | null;
    start?: { index: number };
    end?: { index: number };
};

type IfStatementNode = {
    type: "IfStatement";
    test: IdentifierNode;
    consequent:
        | ReturnStatementNode
        | { type: "BlockStatement"; body: ReturnStatementNode[] };
    alternate:
        | ReturnStatementNode
        | { type: "BlockStatement"; body: ReturnStatementNode[] }
        | null;
    start?: { index: number };
    end?: { index: number };
};

type FunctionDeclarationNode = {
    type: "FunctionDeclaration";
    id: IdentifierNode;
    body: {
        type: "BlockStatement";
        body: Array<IfStatementNode | ReturnStatementNode>;
    };
    start?: { index: number };
    end?: { index: number };
};

type ProgramNode = {
    type: "Program";
    body: FunctionDeclarationNode[];
    comments?: CommentNode[];
};

function buildBooleanReturn(
    testName: string,
    startIndex: number
): IfStatementNode {
    return {
        type: "IfStatement",
        test: { type: "Identifier", name: testName },
        consequent: {
            type: "ReturnStatement",
            argument: { type: "Literal", value: true },
            start: { index: startIndex + 10 },
            end: { index: startIndex + 20 }
        },
        alternate: {
            type: "ReturnStatement",
            argument: { type: "Literal", value: false },
            start: { index: startIndex + 21 },
            end: { index: startIndex + 30 }
        },
        start: { index: startIndex },
        end: { index: startIndex + 40 }
    };
}

void test("condensation leaves doc comments unchanged", () => {
    const docComment: CommentNode = {
        type: "CommentLine",
        value: "/ @description ",
        start: { index: 0 }
    };
    const functionNode: FunctionDeclarationNode = {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "withDoc" },
        body: {
            type: "BlockStatement",
            body: [buildBooleanReturn("condition", 20)]
        },
        start: { index: 10 },
        end: { index: 100 }
    };
    const ast: ProgramNode = {
        type: "Program",
        body: [functionNode],
        comments: [docComment]
    };

    condenseLogicalExpressions(ast);

    const [condensedReturn] = functionNode.body.body as ReturnStatementNode[];
    assert.equal(condensedReturn.type, "ReturnStatement");
    assert.equal(condensedReturn.argument?.type, "Identifier");
    assert.equal(condensedReturn.argument.name, "condition");
    assert.equal(docComment.value, "/ @description ");
});

void test("functions with matching condensed bodies are retained", () => {
    const commentForSecond: CommentNode = {
        type: "CommentLine",
        value: "/ @description existing.",
        start: { index: 150 }
    };
    const firstFunction: FunctionDeclarationNode = {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "duplicated" },
        body: {
            type: "BlockStatement",
            body: [buildBooleanReturn("collide", 20)]
        },
        start: { index: 10 },
        end: { index: 90 }
    };
    const secondFunction: FunctionDeclarationNode = {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "duplicated" },
        body: {
            type: "BlockStatement",
            body: [buildBooleanReturn("collide", 200)]
        },
        start: { index: 200 },
        end: { index: 280 }
    };
    const ast: ProgramNode = {
        type: "Program",
        body: [firstFunction, secondFunction],
        comments: [commentForSecond]
    };

    condenseLogicalExpressions(ast);

    assert.equal(ast.body.length, 2);
    for (const fn of ast.body) {
        const [condensedReturn] = fn.body
            .body as unknown as ReturnStatementNode[];
        assert.equal(condensedReturn.argument?.type, "Identifier");
        assert.equal(condensedReturn.argument.name, "collide");
    }
});
