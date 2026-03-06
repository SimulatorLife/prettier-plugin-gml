import { Core } from "@gml-modules/core";

import type { GmlNode } from "./ast.js";

/**
 * Minimal shape of a `VariableDeclaration` node needed by the collector.
 * Only the fields accessed by `collectLocalVariables` are described here.
 */
interface VariableDeclarationShape {
    declarations: ReadonlyArray<{
        id?: { type?: string; name?: string };
    }>;
}

/**
 * Pre-walk a GML AST to collect all locally declared variable names within the
 * current function scope.
 *
 * In GML, `var` is function-scoped (like JavaScript's `var`), so any variable
 * declared with `var` anywhere in a function body is considered local to that
 * function. This pre-pass collects those names so the event oracle can
 * distinguish local variables from instance fields when classifying identifiers.
 *
 * The walker does NOT descend into nested `FunctionDeclaration` or
 * `ConstructorDeclaration` nodes because those introduce their own lexical
 * scopes; variables declared inside them must not be treated as locals of the
 * enclosing event or script body.
 *
 * @param ast - The root GML AST node to collect from (typically a `ProgramNode`
 *              or `BlockStatementNode` representing the event body).
 * @returns A `Set<string>` of locally declared variable names.
 *
 * @example
 * ```typescript
 * // For a Step event body:
 * // var speed = 5;
 * // var dx = lengthdir_x(speed, direction);
 * // if (x > 1000) { var wrapped = true; }
 * // function helper() { var inner = 0; }
 * const locals = collectLocalVariables(ast);
 * // locals = Set { "speed", "dx", "wrapped" }
 * // Note: "inner" is NOT collected (nested function scope)
 * // Note: "helper" is NOT collected (it is an instance method)
 * ```
 */
export function collectLocalVariables(ast: GmlNode | null | undefined): Set<string> {
    const locals = new Set<string>();
    if (!ast) {
        return locals;
    }

    Core.walkAst(ast, (node: Record<string, unknown>, parent): boolean | undefined => {
        // Skip nested function/constructor declarations that introduce their own
        // lexical scope. The `parent !== null` guard ensures we still descend
        // into the root node itself (e.g., a ProgramNode or BlockStatementNode)
        // even if it is technically a function-like node.
        if (parent !== null && (node.type === "FunctionDeclaration" || node.type === "ConstructorDeclaration")) {
            return false;
        }

        if (node.type === "VariableDeclaration") {
            const varDecl = node as unknown as VariableDeclarationShape;
            for (const declarator of varDecl.declarations ?? []) {
                const id = declarator.id;
                if (id?.type === "Identifier" && typeof id.name === "string" && id.name.length > 0) {
                    locals.add(id.name);
                }
            }
        }

        return undefined;
    });

    return locals;
}
