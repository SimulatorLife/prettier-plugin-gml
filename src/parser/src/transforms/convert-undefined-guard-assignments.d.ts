/**
 * Convert simple undefined guard assignments into ternary expressions so they
 * collapse to a single statement during printing. Matches `if` statements that
 * assign the same identifier in both branches when the guard checks the
 * identifier against the `undefined` sentinel (either via the `is_undefined`
 * helper or an equality comparison).
 *
 * @param {unknown} ast
 * @returns {unknown}
 */
export declare function convertUndefinedGuardAssignments(ast: any): any;
export declare function transform(ast: any): any;
