/**
 * Lightweight stack-based scope tracker for local variable declarations.
 *
 * Used by the GML→JS emitter when `emitSelfPrefix` is enabled to distinguish
 * `var`-declared local variables and function parameters (which should be
 * emitted as bare identifiers) from instance fields (which must be emitted
 * with an explicit `self.` prefix in contexts without the GML proxy wrapper,
 * such as event patches).
 *
 * Each scope level corresponds to a function body. Scopes are pushed on
 * function entry and popped on function exit. Lookups walk from the innermost
 * scope outward, correctly modelling GML's function-scoped `var` declarations.
 *
 * ## GML `var` hoisting
 * GML hoists `var` declarations to the nearest enclosing function scope (similar
 * to JavaScript's pre-ES6 `var`). This implementation uses sequential
 * declaration-order tracking rather than a full pre-scan. Names declared later
 * in a function body are treated as local from the point of declaration forward,
 * which is correct for all well-formed GML code where variables are declared
 * before first use.
 */
export class LocalVarScope {
    private readonly stack: Set<string>[] = [];

    /**
     * The number of active scopes on the stack (0 = top-level, outside any function).
     */
    get depth(): number {
        return this.stack.length;
    }

    /**
     * Push a new function scope onto the stack. Call this when entering a
     * function declaration or constructor body.
     */
    push(): void {
        this.stack.push(new Set<string>());
    }

    /**
     * Pop the innermost function scope off the stack. Call this when leaving
     * a function declaration or constructor body.
     */
    pop(): void {
        this.stack.pop();
    }

    /**
     * Register a name as locally declared in the current (innermost) scope.
     * No-op when the stack is empty (top-level, outside any function).
     *
     * @param name - The identifier name to register as local.
     */
    declare(name: string): void {
        this.stack.at(-1)?.add(name);
    }

    /**
     * Returns `true` if `name` is declared as a local variable in any of
     * the currently active scopes (innermost to outermost).
     *
     * @param name - The identifier name to look up.
     */
    isLocal(name: string): boolean {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            if (this.stack[i]?.has(name)) {
                return true;
            }
        }
        return false;
    }
}
