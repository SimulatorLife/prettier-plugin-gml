/**
 * Shared AST node-type string constants.
 *
 * PURPOSE: These constants replace magic string literals throughout the codebase,
 * making type checks type-safe, refactor-friendly, and easier to maintain. Instead of:
 *   if (node.type === "BinaryExpression")
 * we use:
 *   if (node.type === BINARY_EXPRESSION)
 *
 * CURRENT STATE: This file contains a small subset of the full AST node type vocabulary.
 * Many parts of the codebase still use string literals directly instead of importing
 * these constants.
 *
 * LONG-TERM GOAL: Expand this list to cover all node types defined in the parser grammar,
 * then systematically replace all string literals with imports from this file. This will:
 *   - Catch typos at compile time (referencing an undefined constant)
 *   - Make renaming node types safe (change the constant, get compile errors everywhere
 *     it's used, fix them all)
 *   - Improve discoverability (IDE autocomplete shows all available node types)
 *
 * RECOMMENDATION: Audit the parser grammar and add a constant for every node type. Then,
 * use a linter rule or grep pass to find all remaining string literals that match node
 * type names and replace them with these constants.
 */
export const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
export const BINARY_EXPRESSION = "BinaryExpression";
export const CALL_EXPRESSION = "CallExpression";
export const EXPRESSION_STATEMENT = "ExpressionStatement";
export const IDENTIFIER = "Identifier";
export const LITERAL = "Literal";
export const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
export const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
export const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";
export const UNARY_EXPRESSION = "UnaryExpression";
export const VARIABLE_DECLARATION = "VariableDeclaration";
export const FUNCTION_DECLARATION = "FunctionDeclaration";
export const FUNCTION_EXPRESSION = "FunctionExpression";
export const CONSTRUCTOR_DECLARATION = "ConstructorDeclaration";
