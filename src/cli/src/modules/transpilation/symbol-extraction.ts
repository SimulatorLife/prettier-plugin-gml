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

import { Core } from "@gml-modules/core";

import { getRuntimePathSegments, resolveObjectRuntimeIdFromSegments } from "./runtime-identifiers.js";

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
    const segments = getRuntimePathSegments(filePath);
    const objectRuntimeId = resolveObjectRuntimeIdFromSegments(segments);
    if (objectRuntimeId) {
        return objectRuntimeId;
    }

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

/**
 * Recursively walks an AST node and extracts all symbol references (function calls).
 * This differs from extractSymbolsFromAst by finding where symbols are used rather than defined.
 */
function walkNodeForReferences(node: unknown, references: Set<string>): void {
    if (!node || typeof node !== "object") {
        return;
    }

    const astNode = node as AstNode;

    // Extract from CallExpression nodes (e.g., player_move(), enemy_attack())
    if (astNode.type === "CallExpression") {
        const callee = (astNode as { callee?: AstNode }).callee;
        if (callee) {
            const calleeName = extractIdentifierName(callee);
            if (calleeName) {
                // Convert to runtime ID format
                const runtimeId = `gml_Script_${calleeName}`;
                references.add(runtimeId);
            }
        }
    }

    // Extract from Identifier nodes that might reference global scripts
    // (excluding left-hand side of assignments and function parameters)
    if (astNode.type === "Identifier") {
        const identifierName = extractIdentifierName(astNode);
        if (identifierName) {
            // Check if this is a potential script reference
            // This is a heuristic - we add it as a reference but the dependency
            // tracker will only match it if a corresponding definition exists
            const runtimeId = `gml_Script_${identifierName}`;
            references.add(runtimeId);
        }
    }

    // Recursively walk body array
    if (Array.isArray(astNode.body)) {
        for (const child of astNode.body) {
            walkNodeForReferences(child, references);
        }
    }

    // Recursively walk declarations array
    if (Array.isArray(astNode.declarations)) {
        for (const child of astNode.declarations) {
            walkNodeForReferences(child, references);
        }
    }

    // Walk CallExpression-specific properties
    if ("callee" in astNode) {
        walkNodeForReferences((astNode as { callee?: unknown }).callee, references);
    }
    if ("arguments" in astNode && Array.isArray((astNode as { arguments?: unknown }).arguments)) {
        for (const arg of (astNode as { arguments: Array<unknown> }).arguments) {
            walkNodeForReferences(arg, references);
        }
    }

    // Walk common AST properties
    for (const prop of [
        "init",
        "left",
        "right",
        "argument",
        "test",
        "consequent",
        "alternate",
        "object",
        "property",
        "expression"
    ] as const) {
        const value = astNode[prop];
        if (value) {
            walkNodeForReferences(value, references);
        }
    }
}

/**
 * Extracts all symbol references (function calls and usages) from a GML AST.
 * Used to build dependency graphs for incremental transpilation.
 *
 * @param ast - The parsed AST from Parser.GMLParser
 * @returns Array of runtime symbol IDs referenced in the file
 */
export function extractReferencesFromAst(ast: AstNode): Array<string> {
    const references = new Set<string>();
    walkNodeForReferences(ast, references);
    return Array.from(references);
}
