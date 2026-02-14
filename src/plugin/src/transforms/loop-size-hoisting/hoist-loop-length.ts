import { Core, type MutableGameMakerAstNode } from "@gml-modules/core";

import { resolveLoopHoistIdentifier } from "../../runtime/index.js";
import { buildCachedSizeVariableName, getLoopLengthHoistInfo, getSizeRetrievalFunctionSuffixes } from "./helpers.js";

type LoopLengthHoistTransformOptions = Record<string, unknown> & {
    filepath?: string;
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

    const sizeFunctionSuffixes = getSizeRetrievalFunctionSuffixes();

    const body = Array.isArray(ast.body) ? (ast.body as Array<MutableGameMakerAstNode | null | undefined>) : null;
    if (body) {
        processStatementList(body, sizeFunctionSuffixes, options);
    }

    return ast;
}

function processStatementList(
    statements: Array<MutableGameMakerAstNode | null | undefined>,
    sizeFunctionSuffixes: Map<string, string>,
    options?: LoopLengthHoistTransformOptions
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
            maybeHoistLoopLength(statement, statements, index, sizeFunctionSuffixes, options);
        }

        visitStatementChildren(statement, sizeFunctionSuffixes, options);
    }
}

function visitStatementChildren(
    statement: MutableGameMakerAstNode,
    sizeFunctionSuffixes: Map<string, string>,
    options?: LoopLengthHoistTransformOptions
) {
    if (!statement || typeof statement !== "object") {
        return;
    }

    const body = statement.body;
    if (Array.isArray(body)) {
        processStatementList(body as Array<MutableGameMakerAstNode | null | undefined>, sizeFunctionSuffixes, options);
    } else if (body && typeof body === "object") {
        visitStatementChildren(body as MutableGameMakerAstNode, sizeFunctionSuffixes, options);
    }

    if (statement.type === "IfStatement") {
        visitStatementChildren(statement.consequent as MutableGameMakerAstNode, sizeFunctionSuffixes, options);
        visitStatementChildren(statement.alternate as MutableGameMakerAstNode, sizeFunctionSuffixes, options);
    }

    if (Array.isArray(statement.cases)) {
        for (const caseNode of statement.cases) {
            if (caseNode) {
                visitStatementChildren(caseNode as MutableGameMakerAstNode, sizeFunctionSuffixes, options);
                if (Array.isArray(caseNode.body)) {
                    processStatementList(
                        caseNode.body as Array<MutableGameMakerAstNode | null | undefined>,
                        sizeFunctionSuffixes,
                        options
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
    sizeFunctionSuffixes: Map<string, string>,
    options?: LoopLengthHoistTransformOptions
) {
    const test = node.test as MutableGameMakerAstNode & {
        right?: MutableGameMakerAstNode;
    };
    const hoistInfo = getLoopLengthHoistInfo(node, sizeFunctionSuffixes);
    if (!hoistInfo || !test || !test.right) {
        return;
    }

    const preferredCachedLengthName = buildCachedSizeVariableName(
        hoistInfo.sizeIdentifierName,
        hoistInfo.cachedLengthSuffix
    );
    const cachedLengthName = resolveLoopHoistIdentifier(
        {
            filePath: resolveFormatterFilePath(options),
            localIdentifierNames: collectIdentifierNamesFromStatementList(statements),
            preferredName: preferredCachedLengthName
        },
        options
    )?.identifierName;

    if (!Core.isNonEmptyString(cachedLengthName)) {
        return;
    }

    const loopSizeCall = test.right;
    test.right = {
        type: "Identifier",
        name: cachedLengthName
    };

    const declaration = createLengthDeclaration(cachedLengthName, loopSizeCall) as MutableGameMakerAstNode;

    // Copy location from the loop node to the hoisted declaration so it doesn't
    // default to start: 0 and steal file-header comments.
    if (node.start !== undefined) {
        declaration.start = node.start;
    }

    statements.splice(index, 0, declaration);
}

function resolveFormatterFilePath(options?: LoopLengthHoistTransformOptions): string | null {
    if (!options) {
        return null;
    }

    const filePathCandidate = options.filepath;
    return Core.isNonEmptyString(filePathCandidate) ? filePathCandidate : null;
}

function collectIdentifierNamesFromStatementList(
    statements: Array<MutableGameMakerAstNode | null | undefined>
): ReadonlySet<string> {
    const identifierNames = new Set<string>();

    for (const statement of statements) {
        collectIdentifierNamesFromNode(statement, identifierNames);
    }

    return identifierNames;
}

function collectIdentifierNamesFromNode(
    node: MutableGameMakerAstNode | null | undefined,
    identifierNames: Set<string>
): void {
    if (!node || typeof node !== "object") {
        return;
    }

    if (node.type === "Identifier" && Core.isNonEmptyString(node.name)) {
        identifierNames.add(node.name);
    }

    Core.forEachNodeChild(node, (child) =>
        collectIdentifierNamesFromNode(child as MutableGameMakerAstNode | null | undefined, identifierNames)
    );
}

function createLengthDeclaration(name: string, initializer: MutableGameMakerAstNode) {
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
