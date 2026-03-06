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

import { Core } from "@gml-modules/core";

import type { ProgramNode } from "./ast.js";

type AnyRecord = Record<string, unknown>;

/**
 * Extract the declared variable name from a VariableDeclarator node record.
 * Returns the name string, or null if the shape doesn't match.
 */
function extractDeclaratorName(decl: unknown): string | null {
    if (decl === null || typeof decl !== "object") {
        return null;
    }
    const declRecord = decl as AnyRecord;
    if (declRecord.type !== "VariableDeclarator") {
        return null;
    }
    const id = declRecord.id;
    if (id === null || typeof id !== "object") {
        return null;
    }
    const name = (id as AnyRecord).name;
    return typeof name === "string" && name ? name : null;
}

/**
 * Collect names from a VariableDeclaration node whose `kind` is `"var"`.
 * Adds each declared name to the `out` set.
 */
function collectVarDeclarationNames(node: AnyRecord, out: Set<string>): void {
    if (node.kind !== "var") {
        return;
    }
    const declarations = node.declarations;
    if (!Array.isArray(declarations)) {
        return;
    }
    for (const decl of declarations) {
        const name = extractDeclaratorName(decl);
        if (name) {
            out.add(name);
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
    const locals = new Set<string>();

    Core.walkAst(ast, (node: AnyRecord, _parent: unknown): boolean => {
        // Stop descending into nested function scopes. Their var declarations
        // are local to those functions, not to the enclosing event body.
        if (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration") {
            return false;
        }

        // Collect names from var declarations.
        if (node.type === "VariableDeclaration") {
            collectVarDeclarationNames(node, locals);
        }

        return true;
    });

    return locals;
}
