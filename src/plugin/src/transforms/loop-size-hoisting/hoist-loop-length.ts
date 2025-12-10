import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";
import {
    buildCachedSizeVariableName,
    getLoopLengthHoistInfo,
    getSizeRetrievalFunctionSuffixes
} from "../../loop-size-hoisting/index.js";

type LoopLengthHoistTransformOptions = Record<string, unknown> & {
    loopLengthHoistFunctionSuffixes?: string | string[] | null;
};

/**
 * Parser transform that hoists supported loop size calls out of `for` loop
 * conditions by caching the result in a temporary variable before the loop.
 */
export function hoistLoopLengthBounds(
    ast: MutableGameMakerAstNode,
    options?: LoopLengthHoistTransformOptions
): MutableGameMakerAstNode {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const sizeFunctionSuffixes = getSizeRetrievalFunctionSuffixes(
        options ?? null
    );

    const body = Array.isArray(ast.body)
        ? (ast.body as Array<MutableGameMakerAstNode | null | undefined>)
        : null;
    if (body) {
        processStatementList(body, sizeFunctionSuffixes);
    }

    return ast;
}

function processStatementList(
    statements: Array<MutableGameMakerAstNode | null | undefined>,
    sizeFunctionSuffixes: Map<string, string>
) {
    if (!Array.isArray(statements)) {
        return;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];
        if (!statement || typeof statement !== "object") {
            continue;
        }

        if (statement.type === "ForStatement") {
            maybeHoistLoopLength(
                statement,
                statements,
                index,
                sizeFunctionSuffixes
            );
        }

        visitStatementChildren(statement, sizeFunctionSuffixes);
    }
}

function visitStatementChildren(
    statement: MutableGameMakerAstNode,
    sizeFunctionSuffixes: Map<string, string>
) {
    if (!statement || typeof statement !== "object") {
        return;
    }

    const body = statement.body;
    if (Array.isArray(body)) {
        processStatementList(
            body as Array<MutableGameMakerAstNode | null | undefined>,
            sizeFunctionSuffixes
        );
    } else if (body && typeof body === "object") {
        visitStatementChildren(
            body as MutableGameMakerAstNode,
            sizeFunctionSuffixes
        );
    }

    if (statement.type === "IfStatement") {
        visitStatementChildren(
            statement.consequent as MutableGameMakerAstNode,
            sizeFunctionSuffixes
        );
        visitStatementChildren(
            statement.alternate as MutableGameMakerAstNode,
            sizeFunctionSuffixes
        );
    }

    if (Array.isArray(statement.cases)) {
        for (const caseNode of statement.cases) {
            if (caseNode) {
                visitStatementChildren(
                    caseNode as MutableGameMakerAstNode,
                    sizeFunctionSuffixes
                );
                if (Array.isArray(caseNode.body)) {
                    processStatementList(
                        caseNode.body as Array<
                            MutableGameMakerAstNode | null | undefined
                        >,
                        sizeFunctionSuffixes
                    );
                }
            }
        }
    }
}

function maybeHoistLoopLength(
    node: MutableGameMakerAstNode,
    statements: Array<MutableGameMakerAstNode | null | undefined>,
    index: number,
    sizeFunctionSuffixes: Map<string, string>
) {
    const test = node.test as MutableGameMakerAstNode & {
        right?: MutableGameMakerAstNode;
    };
    const hoistInfo = getLoopLengthHoistInfo(node, sizeFunctionSuffixes);
    if (!hoistInfo || !test || !test.right) {
        return;
    }

    const cachedLengthName = buildCachedSizeVariableName(
        hoistInfo.sizeIdentifierName,
        hoistInfo.cachedLengthSuffix
    );

    if (hasIdentifierConflict(statements, cachedLengthName, index)) {
        return;
    }

    const loopSizeCall = test.right;
    test.right = {
        type: "Identifier",
        name: cachedLengthName
    };

    const declaration = createLengthDeclaration(cachedLengthName, loopSizeCall);
    statements.splice(index, 0, declaration);
}

function hasIdentifierConflict(
    statements: Array<MutableGameMakerAstNode | null | undefined>,
    identifierName: string,
    currentIndex: number
): boolean {
    if (
        !Array.isArray(statements) ||
        typeof identifierName !== "string" ||
        identifierName.length === 0
    ) {
        return false;
    }

    for (const [index, statement] of statements.entries()) {
        if (index === currentIndex) {
            continue;
        }

        if (nodeDeclaresIdentifier(statement, identifierName)) {
            return true;
        }
    }

    return false;
}

function nodeDeclaresIdentifier(
    node: MutableGameMakerAstNode | null | undefined,
    identifierName: string
): boolean {
    if (!node || typeof identifierName !== "string") {
        return false;
    }

    if (node.type === "VariableDeclaration") {
        const declarations = Array.isArray(node.declarations)
            ? node.declarations
            : [];

        for (const declarator of declarations) {
            if (
                declarator &&
                declarator.type === "VariableDeclarator" &&
                Core.getIdentifierText(declarator.id) === identifierName
            ) {
                return true;
            }
        }

        return false;
    }

    if (node.type === "ForStatement") {
        return nodeDeclaresIdentifier(
            node.init as MutableGameMakerAstNode | null | undefined,
            identifierName
        );
    }

    const nodeIdName = Core.getIdentifierText(node.id);
    return nodeIdName === identifierName;
}

function createLengthDeclaration(
    name: string,
    initializer: MutableGameMakerAstNode
) {
    return {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [
            {
                type: "VariableDeclarator",
                id: { type: "Identifier", name },
                init: initializer
            }
        ]
    };
}
