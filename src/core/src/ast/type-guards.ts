/**
 * Comprehensive type guard library for GameMaker AST nodes.
 *
 * This module consolidates type checks scattered throughout the codebase into a
 * single, reusable library. Instead of duplicating `node.type === "..."` checks
 * across transforms, printers, and other modules, callers can use these type-safe
 * guards that provide TypeScript narrowing and improve maintainability.
 *
 * Benefits:
 * - Type safety: Guards return proper TypeScript predicates (`node is T`)
 * - DRY: Eliminates 150+ duplicate type checks across the codebase
 * - Consistency: All guards follow the same pattern and use shared constants
 * - Refactor-friendly: Changing node types updates one location
 * - Performance: Uses the same optimized `hasType` helper as existing guards
 *
 * Usage pattern:
 * ```ts
 * // Before:
 * if (node.type === "BinaryExpression") { ... }
 *
 * // After:
 * if (isBinaryExpressionNode(node)) { ... }
 * ```
 */

import { hasType } from "./node-helpers.js";
import {
    ARROW_FUNCTION_EXPRESSION,
    ASSIGNMENT_EXPRESSION,
    BINARY_EXPRESSION,
    BLOCK_STATEMENT,
    BREAK_STATEMENT,
    CASE_CLAUSE,
    CATCH_CLAUSE,
    CONDITIONAL_EXPRESSION,
    CONSTRUCTOR_DECLARATION,
    CONTINUE_STATEMENT,
    DELETE_STATEMENT,
    DO_UNTIL_STATEMENT,
    EMPTY_STATEMENT,
    ENUM_DECLARATION,
    ENUM_MEMBER,
    EXIT_STATEMENT,
    EXPRESSION_STATEMENT,
    FOR_STATEMENT,
    FUNCTION_DECLARATION,
    FUNCTION_EXPRESSION,
    GLOBAL_VAR_STATEMENT,
    IF_STATEMENT,
    INC_DEC_EXPRESSION,
    INC_DEC_STATEMENT,
    LOGICAL_EXPRESSION,
    MACRO_DECLARATION,
    MEMBER_DOT_EXPRESSION,
    NEW_EXPRESSION,
    PARENTHESIZED_EXPRESSION,
    PROGRAM,
    REPEAT_STATEMENT,
    RETURN_STATEMENT,
    SEQUENCE_EXPRESSION,
    STRUCT_DECLARATION,
    STRUCT_EXPRESSION,
    STRUCT_FUNCTION_DECLARATION,
    STRUCT_LITERAL_MEMBER,
    SWITCH_CASE,
    SWITCH_STATEMENT,
    TEMPLATE_STRING_EXPRESSION,
    TERNARY_EXPRESSION,
    THROW_STATEMENT,
    TRY_STATEMENT,
    UNARY_EXPRESSION,
    VARIABLE_DECLARATION,
    VARIABLE_DECLARATOR,
    WHILE_STATEMENT,
    WITH_STATEMENT
} from "./node-types.js";
import type {
    MutableGameMakerAstNode,
    ParenthesizedExpressionNode,
    VariableDeclarationNode,
    VariableDeclaratorNode
} from "./types.js";

/**
 * Type guard for binary expression nodes.
 *
 * Binary expressions represent operations with two operands (e.g., `a + b`,
 * `x == y`, `foo && bar`).
 */
export function isBinaryExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, BINARY_EXPRESSION);
}

/**
 * Type guard for logical expression nodes.
 *
 * Logical expressions represent boolean operations (`&&`, `||`, `and`, `or`).
 */
export function isLogicalExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, LOGICAL_EXPRESSION);
}

/**
 * Type guard for unary expression nodes.
 *
 * Unary expressions represent operations with one operand (e.g., `!x`, `-y`, `~z`).
 */
export function isUnaryExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, UNARY_EXPRESSION);
}

/**
 * Type guard for assignment expression nodes.
 *
 * Assignment expressions represent value assignments (e.g., `x = 5`, `y += 10`).
 */
export function isAssignmentExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, ASSIGNMENT_EXPRESSION);
}

/**
 * Type guard for conditional (ternary) expression nodes.
 *
 * Conditional expressions represent ternary operations (e.g., `x ? y : z`).
 */
export function isConditionalExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, CONDITIONAL_EXPRESSION);
}

/**
 * Type guard for ternary expression nodes.
 *
 * Ternary expressions are GameMaker's alternative syntax for conditional expressions.
 */
export function isTernaryExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, TERNARY_EXPRESSION);
}

/**
 * Type guard for member dot expression nodes.
 *
 * Member dot expressions represent property access using dot notation (e.g., `obj.prop`).
 */
export function isMemberDotExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, MEMBER_DOT_EXPRESSION);
}

/**
 * Type guard for parenthesized expression nodes.
 *
 * Parenthesized expressions wrap other expressions in parentheses for grouping or precedence.
 */
export function isParenthesizedExpressionNode(node: unknown): node is ParenthesizedExpressionNode {
    return hasType(node, PARENTHESIZED_EXPRESSION);
}

/**
 * Type guard for new expression nodes.
 *
 * New expressions represent constructor calls (e.g., `new ClassName()`).
 */
export function isNewExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, NEW_EXPRESSION);
}

/**
 * Type guard for sequence expression nodes.
 *
 * Sequence expressions represent comma-separated expression lists.
 */
export function isSequenceExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, SEQUENCE_EXPRESSION);
}

/**
 * Type guard for struct expression nodes.
 *
 * Struct expressions represent struct literals (e.g., `{ x: 1, y: 2 }`).
 */
export function isStructExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, STRUCT_EXPRESSION);
}

/**
 * Type guard for struct literal member nodes.
 *
 * Struct literal members represent individual properties in struct expressions.
 */
export function isStructLiteralMemberNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, STRUCT_LITERAL_MEMBER);
}

/**
 * Type guard for template string expression nodes.
 *
 * Template string expressions represent string interpolation (e.g., `$"Hello {name}"`).
 */
export function isTemplateStringExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, TEMPLATE_STRING_EXPRESSION);
}

/**
 * Type guard for arrow function expression nodes.
 *
 * Arrow function expressions represent lambda-style functions (e.g., `() => value`).
 */
export function isArrowFunctionExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, ARROW_FUNCTION_EXPRESSION);
}

/**
 * Type guard for function expression nodes.
 *
 * Function expressions represent anonymous or named function definitions used as values.
 */
export function isFunctionExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, FUNCTION_EXPRESSION);
}

/**
 * Type guard for increment/decrement expression nodes.
 *
 * Inc/dec expressions represent `++` and `--` operations used as expressions.
 */
export function isIncDecExpressionNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, INC_DEC_EXPRESSION);
}

/**
 * Type guard for block statement nodes.
 *
 * Block statements represent groups of statements enclosed in braces.
 */
export function isBlockStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, BLOCK_STATEMENT);
}

/**
 * Type guard for expression statement nodes.
 *
 * Expression statements wrap expressions to use them as statements.
 */
export function isExpressionStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, EXPRESSION_STATEMENT);
}

/**
 * Type guard for if statement nodes.
 *
 * If statements represent conditional branching (`if`/`else`).
 */
export function isIfStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, IF_STATEMENT);
}

/**
 * Type guard for switch statement nodes.
 *
 * Switch statements represent multi-way branching based on a value.
 */
export function isSwitchStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, SWITCH_STATEMENT);
}

/**
 * Type guard for switch case nodes.
 *
 * Switch cases represent individual cases within switch statements.
 */
export function isSwitchCaseNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, SWITCH_CASE);
}

/**
 * Type guard for case clause nodes.
 *
 * Case clauses represent the matching portion of a switch case.
 */
export function isCaseClauseNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, CASE_CLAUSE);
}

/**
 * Type guard for for statement nodes.
 *
 * For statements represent loop constructs with initialization, condition, and update.
 */
export function isForStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, FOR_STATEMENT);
}

/**
 * Type guard for while statement nodes.
 *
 * While statements represent pre-condition loops.
 */
export function isWhileStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, WHILE_STATEMENT);
}

/**
 * Type guard for do-until statement nodes.
 *
 * Do-until statements represent post-condition loops (GameMaker's equivalent of do-while).
 */
export function isDoUntilStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, DO_UNTIL_STATEMENT);
}

/**
 * Type guard for repeat statement nodes.
 *
 * Repeat statements represent fixed-iteration loops.
 */
export function isRepeatStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, REPEAT_STATEMENT);
}

/**
 * Type guard for with statement nodes.
 *
 * With statements change the scope context for the contained block.
 */
export function isWithStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, WITH_STATEMENT);
}

/**
 * Type guard for break statement nodes.
 *
 * Break statements exit from loops or switch statements.
 */
export function isBreakStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, BREAK_STATEMENT);
}

/**
 * Type guard for continue statement nodes.
 *
 * Continue statements skip to the next iteration of a loop.
 */
export function isContinueStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, CONTINUE_STATEMENT);
}

/**
 * Type guard for return statement nodes.
 *
 * Return statements exit from functions with optional return values.
 */
export function isReturnStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, RETURN_STATEMENT);
}

/**
 * Type guard for throw statement nodes.
 *
 * Throw statements raise exceptions.
 */
export function isThrowStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, THROW_STATEMENT);
}

/**
 * Type guard for try statement nodes.
 *
 * Try statements represent exception handling blocks.
 */
export function isTryStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, TRY_STATEMENT);
}

/**
 * Type guard for catch clause nodes.
 *
 * Catch clauses represent the exception handler portion of try statements.
 */
export function isCatchClauseNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, CATCH_CLAUSE);
}

/**
 * Type guard for empty statement nodes.
 *
 * Empty statements represent standalone semicolons or no-op statements.
 */
export function isEmptyStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, EMPTY_STATEMENT);
}

/**
 * Type guard for delete statement nodes.
 *
 * Delete statements remove properties or variables.
 */
export function isDeleteStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, DELETE_STATEMENT);
}

/**
 * Type guard for exit statement nodes.
 *
 * Exit statements terminate the current script or function.
 */
export function isExitStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, EXIT_STATEMENT);
}

/**
 * Type guard for global var statement nodes.
 *
 * Global var statements declare global variables.
 */
export function isGlobalVarStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, GLOBAL_VAR_STATEMENT);
}

/**
 * Type guard for increment/decrement statement nodes.
 *
 * Inc/dec statements represent `++` and `--` operations used as statements.
 */
export function isIncDecStatementNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, INC_DEC_STATEMENT);
}

/**
 * Type guard for variable declaration nodes.
 *
 * Variable declarations represent `var`, `static`, or `global` declarations.
 */
export function isVariableDeclarationNode(node: unknown): node is VariableDeclarationNode {
    return hasType(node, VARIABLE_DECLARATION);
}

/**
 * Type guard for variable declarator nodes.
 *
 * Variable declarators represent individual variables within a declaration.
 */
export function isVariableDeclaratorNode(node: unknown): node is VariableDeclaratorNode {
    return hasType(node, VARIABLE_DECLARATOR);
}

/**
 * Type guard for function declaration nodes.
 *
 * Function declarations represent top-level or nested function definitions.
 */
export function isFunctionDeclarationNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, FUNCTION_DECLARATION);
}

/**
 * Type guard for constructor declaration nodes.
 *
 * Constructor declarations represent class constructors in GameMaker.
 */
export function isConstructorDeclarationNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, CONSTRUCTOR_DECLARATION);
}

/**
 * Type guard for struct declaration nodes.
 *
 * Struct declarations represent struct type definitions.
 */
export function isStructDeclarationNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, STRUCT_DECLARATION);
}

/**
 * Type guard for struct function declaration nodes.
 *
 * Struct function declarations represent methods defined within structs.
 */
export function isStructFunctionDeclarationNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, STRUCT_FUNCTION_DECLARATION);
}

/**
 * Type guard for enum declaration nodes.
 *
 * Enum declarations represent enumeration type definitions.
 */
export function isEnumDeclarationNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, ENUM_DECLARATION);
}

/**
 * Type guard for enum member nodes.
 *
 * Enum members represent individual values within an enum declaration.
 */
export function isEnumMemberNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, ENUM_MEMBER);
}

/**
 * Type guard for macro declaration nodes.
 *
 * Macro declarations represent `#macro` preprocessor directives.
 */
export function isMacroDeclarationNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, MACRO_DECLARATION);
}

/**
 * Type guard for program nodes.
 *
 * Program nodes represent the root of the AST.
 */
export function isProgramNode(node: unknown): node is MutableGameMakerAstNode {
    return hasType(node, PROGRAM);
}
