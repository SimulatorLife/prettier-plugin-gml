/**
 * Shared AST node-type string constants.
 *
 * PURPOSE: These constants replace magic string literals throughout the codebase,
 * making type checks type-safe, refactor-friendly, and easier to maintain. Instead of:
 *   if (node.type === "BinaryExpression")
 * we use:
 *   if (node.type === BINARY_EXPRESSION)
 *
 * BENEFITS:
 *   - Catch typos at compile time (referencing an undefined constant)
 *   - Make renaming node types safe (change the constant, get compile errors everywhere)
 *   - Improve discoverability (IDE autocomplete shows all available node types)
 *   - Enable tree-shaking and better minification of production builds
 */

// Expressions
export const ARROW_FUNCTION_EXPRESSION = "ArrowFunctionExpression";
export const ASSIGNMENT_EXPRESSION = "AssignmentExpression";
export const ASSIGNMENT_PATTERN = "AssignmentPattern";
export const BINARY_EXPRESSION = "BinaryExpression";
export const CALL_EXPRESSION = "CallExpression";
export const CONDITIONAL_EXPRESSION = "ConditionalExpression";
export const FUNCTION_EXPRESSION = "FunctionExpression";
export const IDENTIFIER = "Identifier";
export const INC_DEC_EXPRESSION = "IncDecExpression";
export const LITERAL = "Literal";
export const LOGICAL_EXPRESSION = "LogicalExpression";
export const MEMBER_DOT_EXPRESSION = "MemberDotExpression";
export const MEMBER_EXPRESSION = "MemberExpression";
export const MEMBER_INDEX_EXPRESSION = "MemberIndexExpression";
export const NAMESPACE_ACCESS_EXPRESSION = "NamespaceAccessExpression";
export const NEW_EXPRESSION = "NewExpression";
export const NUMERIC_LITERAL = "NumericLiteral";
export const PARENTHESIZED_EXPRESSION = "ParenthesizedExpression";
export const SEQUENCE_EXPRESSION = "SequenceExpression";
export const STRUCT_EXPRESSION = "StructExpression";
export const TEMPLATE_STRING_EXPRESSION = "TemplateStringExpression";
export const TEMPLATE_STRING_TEXT = "TemplateStringText";
export const TERNARY_EXPRESSION = "TernaryExpression";
export const UNARY_EXPRESSION = "UnaryExpression";

// Statements
export const BLOCK_STATEMENT = "BlockStatement";
export const BREAK_STATEMENT = "BreakStatement";
export const CONTINUE_STATEMENT = "ContinueStatement";
export const DELETE_STATEMENT = "DeleteStatement";
export const DO_UNTIL_STATEMENT = "DoUntilStatement";
export const EMPTY_STATEMENT = "EmptyStatement";
export const EXIT_STATEMENT = "ExitStatement";
export const EXPRESSION_STATEMENT = "ExpressionStatement";
export const FOR_STATEMENT = "ForStatement";
export const GLOBAL_VAR_STATEMENT = "GlobalVarStatement";
export const IF_STATEMENT = "IfStatement";
export const INC_DEC_STATEMENT = "IncDecStatement";
export const REPEAT_STATEMENT = "RepeatStatement";
export const RETURN_STATEMENT = "ReturnStatement";
export const SWITCH_STATEMENT = "SwitchStatement";
export const THROW_STATEMENT = "ThrowStatement";
export const TRY_STATEMENT = "TryStatement";
export const VARIABLE_DECLARATION = "VariableDeclaration";
export const WHILE_STATEMENT = "WhileStatement";
export const WITH_STATEMENT = "WithStatement";

// Declarations
export const CONSTRUCTOR_DECLARATION = "ConstructorDeclaration";
export const ENUM_DECLARATION = "EnumDeclaration";
export const FUNCTION_DECLARATION = "FunctionDeclaration";
export const MACRO_DECLARATION = "MacroDeclaration";
export const STRUCT_DECLARATION = "StructDeclaration";
export const STRUCT_FUNCTION_DECLARATION = "StructFunctionDeclaration";
export const VARIABLE_DECLARATOR = "VariableDeclarator";

// Other
export const CASE_CLAUSE = "CaseClause";
export const CATCH_CLAUSE = "CatchClause";
export const COMMENT_BLOCK = "CommentBlock";
export const COMMENT_LINE = "CommentLine";
export const CONSTRUCTOR_PARENT_CLAUSE = "ConstructorParentClause";
export const DEFAULT_PARAMETER = "DefaultParameter";
export const DEFINE_STATEMENT = "DefineStatement";
export const ENUM_MEMBER = "EnumMember";
export const FINALIZER = "Finalizer";
export const MISSING_OPTIONAL_ARGUMENT = "MissingOptionalArgument";
export const PROGRAM = "Program";
export const REST_PARAMETER = "RestParameter";
export const STRUCT_LITERAL_MEMBER = "StructLiteralMember";
export const SWITCH_CASE = "SwitchCase";
