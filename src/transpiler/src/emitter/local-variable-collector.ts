/**
 * Local variable collector for GML event transpilation.
 *
 * In GML, `var` declarations are function-scoped (similar to JavaScript's `var`).
 * When transpiling object events, we need to distinguish between:
 *   - Local variables: declared with `var` in the event body
 *   - Instance fields: all other identifiers that resolve to `self.<name>`
 *
 * This module provides `collectLocalVariables`, which walks an AST and returns
 * the set of all `var`-declared variable names. Nested function scopes are not
 * descended into because their `var` declarations belong to those inner functions,
 * not to the enclosing event body.
 */

import type { ProgramNode } from "./ast.js";

type AstRecord = Record<string, unknown>;

function isAstRecord(value: unknown): value is AstRecord {
    return value !== null && typeof value === "object";
}

function isFunctionScopeBoundary(node: AstRecord): boolean {
    return node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration";
}

function collectVarDeclaratorNames(node: AstRecord, localNames: Set<string>): void {
    if (node.type !== "VariableDeclaration" || node.kind !== "var" || !Array.isArray(node.declarations)) {
        return;
    }

    for (const declaration of node.declarations) {
        if (!isAstRecord(declaration) || declaration.type !== "VariableDeclarator" || !isAstRecord(declaration.id)) {
            continue;
        }

        const { name } = declaration.id;
        if (typeof name === "string" && name.length > 0) {
            localNames.add(name);
        }
    }
}

function collectVarDeclarationsFromTree(root: unknown, localNames: Set<string>): void {
    const traversalStack: unknown[] = [root];

    while (traversalStack.length > 0) {
        const currentNode = traversalStack.pop();
        if (currentNode === undefined) {
            continue;
        }

        if (Array.isArray(currentNode)) {
            for (let index = currentNode.length - 1; index >= 0; index -= 1) {
                traversalStack.push(currentNode[index]);
            }
            continue;
        }

        if (!isAstRecord(currentNode) || isFunctionScopeBoundary(currentNode)) {
            continue;
        }

        collectVarDeclaratorNames(currentNode, localNames);

        for (const key of Object.keys(currentNode)) {
            traversalStack.push(currentNode[key]);
        }
    }
}

/**
 * Walk a GML event AST and collect all variable names declared with `var`.
 *
 * Traversal stops at nested `FunctionDeclaration` and `ConstructorDeclaration`
 * boundaries so that inner-function locals are not included in the returned set.
 *
 * @param ast - The root `Program` node to walk
 * @returns An immutable set of all `var`-declared variable names in the event body
 *
 * @example
 * ```gml
 * // Event body:
 * var speed = 5;
 * var dx = cos(direction) * speed;
 * health -= 1;           // NOT a local (instance field)
 * if (alive) {
 *     var msg = "hit";   // IS a local (var is function-scoped in GML)
 * }
 * ```
 * ```typescript
 * const locals = collectLocalVariables(ast);
 * // locals = Set { "speed", "dx", "msg" }
 * ```
 */
export function collectLocalVariables(ast: ProgramNode): ReadonlySet<string> {
    const localNames = new Set<string>();
    collectVarDeclarationsFromTree(ast, localNames);
    return localNames;
}
