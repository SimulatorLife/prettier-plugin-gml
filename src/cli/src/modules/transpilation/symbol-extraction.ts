/**
 * Symbol extraction for semantic-aware hot-reload coordination.
 *
 * Extracts function and script definitions from GML AST nodes to enable
 * accurate dependency tracking. This replaces the basic file name heuristics
 * with true AST-based symbol extraction.
 *
 * Example usage:
 * ```ts
 * import { Parser } from "@gml-modules/parser";
 * import { extractSymbolsFromAst } from "./symbol-extraction.js";
 *
 * const parser = new Parser.GMLParser(sourceText, {});
 * const ast = parser.parse();
 * const symbols = extractSymbolsFromAst(ast, filePath);
 * // Returns: ["gml_Script_player_move", "gml_Script_player_jump"]
 * ```
 */

import path from "node:path";

import { Core } from "@gml-modules/core";

const { FUNCTION_DECLARATION, VARIABLE_DECLARATOR, ASSIGNMENT_EXPRESSION } = {
    FUNCTION_DECLARATION: Core.FUNCTION_DECLARATION,
    VARIABLE_DECLARATOR: Core.VARIABLE_DECLARATOR,
    ASSIGNMENT_EXPRESSION: Core.ASSIGNMENT_EXPRESSION
};

interface AstNode {
    type?: string | null;
    id?: string | AstNode | null;
    name?: string | AstNode | null;
    init?: AstNode | null;
    left?: AstNode | null;
    right?: AstNode | null;
    body?: Array<unknown> | null;
    declarations?: Array<AstNode> | null;
}

/**
 * Checks if a node is an identifier node with a name.
 */
function isIdentifierNode(node: unknown): node is { name: string } {
    return (
        typeof node === "object" &&
        node !== null &&
        "type" in node &&
        node.type === "Identifier" &&
        "name" in node &&
        typeof node.name === "string"
    );
}

/**
 * Extracts the identifier name from a node.
 * Handles both string names and identifier nodes.
 */
function extractIdentifierName(node: string | AstNode | null | undefined): string | null {
    if (typeof node === "string") {
        return node;
    }
    if (isIdentifierNode(node)) {
        return node.name;
    }
    return null;
}

/**
 * Checks if a node represents a function value (FunctionDeclaration, FunctionExpression, or ArrowFunctionExpression).
 */
function isFunctionValue(node: AstNode | null | undefined): boolean {
    if (!node || typeof node !== "object") {
        return false;
    }
    const type = node.type;
    return type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression";
}

/**
 * Extracts function definitions from variable declarators.
 * Handles: var myFunc = function() { }
 */
function extractFromVariableDeclarator(node: AstNode, filePath: string): Array<string> {
    const symbols: Array<string> = [];
    const idName = extractIdentifierName(node.id);
    if (idName && node.init && isFunctionValue(node.init)) {
        const runtimeId = resolveRuntimeIdFromPath(filePath, idName);
        if (runtimeId) {
            symbols.push(runtimeId);
        }
    }
    return symbols;
}

/**
 * Extracts function definitions from assignment expressions.
 * Handles: myFunc = function() { }
 */
function extractFromAssignment(node: AstNode, filePath: string): Array<string> {
    const symbols: Array<string> = [];
    const leftName = extractIdentifierName(node.left);
    if (leftName && node.right && isFunctionValue(node.right)) {
        const runtimeId = resolveRuntimeIdFromPath(filePath, leftName);
        if (runtimeId) {
            symbols.push(runtimeId);
        }
    }
    return symbols;
}

/**
 * Resolves a runtime identifier from a file path and symbol name.
 * Uses path heuristics to determine if it's a script or object event.
 */
function resolveRuntimeIdFromPath(filePath: string, symbolName: string): string | null {
    const normalizedPath = path.normalize(filePath);
    const segments = Core.compactArray(normalizedPath.split(path.sep));

    // Check if this is in an objects/ directory (object event)
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index] !== "objects") {
            continue;
        }

        const objectName = segments[index + 1];
        const eventFile = segments[index + 2];
        if (!objectName || !eventFile) {
            continue;
        }

        const eventName = path.basename(eventFile, path.extname(eventFile));
        if (!eventName) {
            continue;
        }

        return `gml_Object_${objectName}_${eventName}`;
    }

    // Check if this is in a scripts/ directory (script file)
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        if (segments[index] !== "scripts") {
            continue;
        }

        return `gml_Script_${symbolName}`;
    }

    // Fallback: use symbol name directly
    return `gml_Script_${symbolName}`;
}

/**
 * Recursively walks an AST node and extracts all symbol definitions.
 */
function walkNode(node: unknown, filePath: string, symbols: Array<string>): void {
    if (!node || typeof node !== "object") {
        return;
    }

    const astNode = node as AstNode;

    // Extract from FunctionDeclaration nodes
    if (astNode.type === FUNCTION_DECLARATION) {
        const functionName = extractIdentifierName(astNode.id);
        if (functionName) {
            const runtimeId = resolveRuntimeIdFromPath(filePath, functionName);
            if (runtimeId) {
                symbols.push(runtimeId);
            }
        }
    }

    // Extract from VariableDeclarator nodes (var myFunc = function() {})
    if (astNode.type === VARIABLE_DECLARATOR) {
        symbols.push(...extractFromVariableDeclarator(astNode, filePath));
    }

    // Extract from AssignmentExpression nodes (myFunc = function() {})
    if (astNode.type === ASSIGNMENT_EXPRESSION) {
        symbols.push(...extractFromAssignment(astNode, filePath));
    }

    // Recursively walk body array (for Program, BlockStatement, etc.)
    if (Array.isArray(astNode.body)) {
        for (const child of astNode.body) {
            walkNode(child, filePath, symbols);
        }
    }

    // Recursively walk declarations array (for VariableDeclaration, etc.)
    if (Array.isArray(astNode.declarations)) {
        for (const child of astNode.declarations) {
            walkNode(child, filePath, symbols);
        }
    }

    // Walk common AST properties that might contain nested nodes
    for (const prop of ["init", "left", "right", "argument", "test", "consequent", "alternate"] as const) {
        const value = astNode[prop];
        if (value) {
            walkNode(value, filePath, symbols);
        }
    }
}

/**
 * Extracts all symbol definitions from a GML AST.
 *
 * @param ast - The parsed AST from Parser.GMLParser
 * @param filePath - The source file path for context
 * @returns Array of runtime symbol IDs (e.g., "gml_Script_player_move")
 */
export function extractSymbolsFromAst(ast: AstNode, filePath: string): Array<string> {
    const symbols: Array<string> = [];
    walkNode(ast, filePath, symbols);
    return Core.uniqueArray(symbols) as Array<string>;
}
