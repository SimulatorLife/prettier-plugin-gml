// Centralizes access to the generated lexer's literal token names so parser- and
// printer-level utilities can import them from a parser-focused location.
import { default as Lexer } from "./generated/GameMakerLanguageLexer.js";

export const MULTI_LINE_COMMENT = Lexer.literalNames[Lexer.MultiLineComment];
export const SINGLE_LINE_COMMENT = Lexer.literalNames[Lexer.SingleLineComment];
export const INLINE_COMMENT = Lexer.literalNames[Lexer.InlineComment];
export const LINE_CONTINUATION = Lexer.literalNames[Lexer.LineContinuation];
export const LIST_ACCESSOR = Lexer.literalNames[Lexer.ListAccessor];
export const MAP_ACCESSOR = Lexer.literalNames[Lexer.MapAccessor];
export const GRID_ACCESSOR = Lexer.literalNames[Lexer.GridAccessor];
export const ARRAY_ACCESSOR = Lexer.literalNames[Lexer.ArrayAccessor];
export const STRUCT_ACCESSOR = Lexer.literalNames[Lexer.StructAccessor];
export const OPEN_PAREN = Lexer.literalNames[Lexer.OpenParen];
export const CLOSE_PAREN = Lexer.literalNames[Lexer.CloseParen];
export const OPEN_BRACE = Lexer.literalNames[Lexer.OpenBrace];
export const TEMPLATE_STRING_END_EXPRESSION =
    Lexer.literalNames[Lexer.TemplateStringEndExpression];
export const CLOSE_BRACE = Lexer.literalNames[Lexer.CloseBrace];
export const BEGIN = Lexer.literalNames[Lexer.Begin];
export const END = Lexer.literalNames[Lexer.End];
export const SEMI_COLON = Lexer.literalNames[Lexer.SemiColon];
export const COMMA = Lexer.literalNames[Lexer.Comma];
export const ASSIGN = Lexer.literalNames[Lexer.Assign];
export const COLON = Lexer.literalNames[Lexer.Colon];
export const DOT = Lexer.literalNames[Lexer.Dot];
export const PLUS_PLUS = Lexer.literalNames[Lexer.PlusPlus];
export const MINUS_MINUS = Lexer.literalNames[Lexer.MinusMinus];
export const PLUS = Lexer.literalNames[Lexer.Plus];
export const MINUS = Lexer.literalNames[Lexer.Minus];
export const BIT_NOT = Lexer.literalNames[Lexer.BitNot];
export const NOT = Lexer.literalNames[Lexer.Not];
export const MULTIPLY = Lexer.literalNames[Lexer.Multiply];
export const DIVIDE = Lexer.literalNames[Lexer.Divide];
export const INTEGER_DIVIDE = Lexer.literalNames[Lexer.IntegerDivide];
export const MODULO = Lexer.literalNames[Lexer.Modulo];
export const POWER = Lexer.literalNames[Lexer.Power];
export const QUESTION_MARK = Lexer.literalNames[Lexer.QuestionMark];
export const NULL_COALESCE = Lexer.literalNames[Lexer.NullCoalesce];
export const NULL_COALESCING_ASSIGN =
    Lexer.literalNames[Lexer.NullCoalescingAssign];
export const RIGHT_SHIFT_ARITHMETIC =
    Lexer.literalNames[Lexer.RightShiftArithmetic];
export const LEFT_SHIFT_ARITHMETIC =
    Lexer.literalNames[Lexer.LeftShiftArithmetic];
export const LESS_THAN = Lexer.literalNames[Lexer.LessThan];
export const MORE_THAN = Lexer.literalNames[Lexer.MoreThan];
export const LESS_THAN_EQUALS = Lexer.literalNames[Lexer.LessThanEquals];
export const GREATER_THAN_EQUALS = Lexer.literalNames[Lexer.GreaterThanEquals];
export const EQUALS = Lexer.literalNames[Lexer.Equals];
export const NOT_EQUALS = Lexer.literalNames[Lexer.NotEquals];
export const BIT_AND = Lexer.literalNames[Lexer.BitAnd];
export const BIT_XOR = Lexer.literalNames[Lexer.BitXOr];
export const BIT_OR = Lexer.literalNames[Lexer.BitOr];
export const AND = Lexer.literalNames[Lexer.And];
export const OR = Lexer.literalNames[Lexer.Or];
export const XOR = Lexer.literalNames[Lexer.Xor];
export const MULTIPLY_ASSIGN = Lexer.literalNames[Lexer.MultiplyAssign];
export const DIVIDE_ASSIGN = Lexer.literalNames[Lexer.DivideAssign];
export const PLUS_ASSIGN = Lexer.literalNames[Lexer.PlusAssign];
export const MINUS_ASSIGN = Lexer.literalNames[Lexer.MinusAssign];
export const MODULUS_ASSIGN = Lexer.literalNames[Lexer.ModulusAssign];
export const LEFT_SHIFT_ARITHMETIC_ASSIGN =
    Lexer.literalNames[Lexer.LeftShiftArithmeticAssign];
export const RIGHT_SHIFT_ARITHMETIC_ASSIGN =
    Lexer.literalNames[Lexer.RightShiftArithmeticAssign];
export const BIT_AND_ASSIGN = Lexer.literalNames[Lexer.BitAndAssign];
export const BIT_XOR_ASSIGN = Lexer.literalNames[Lexer.BitXorAssign];
export const BIT_OR_ASSIGN = Lexer.literalNames[Lexer.BitOrAssign];
export const NUMBER_SIGN = Lexer.literalNames[Lexer.NumberSign];
export const DOLLAR_SIGN = Lexer.literalNames[Lexer.DollarSign];
export const AT_SIGN = Lexer.literalNames[Lexer.AtSign];
export const BOOLEAN_LITERAL = Lexer.literalNames[Lexer.BooleanLiteral];
export const INTEGER_LITERAL = Lexer.literalNames[Lexer.IntegerLiteral];
export const DECIMAL_LITERAL = Lexer.literalNames[Lexer.DecimalLiteral];
export const BINARY_LITERAL = Lexer.literalNames[Lexer.BinaryLiteral];
export const HEX_INTEGER_LITERAL = Lexer.literalNames[Lexer.HexIntegerLiteral];
export const UNDEFINED = Lexer.literalNames[Lexer.Undefined];
export const NO_ONE = Lexer.literalNames[Lexer.NoOne];
export const BREAK = Lexer.literalNames[Lexer.Break];
export const EXIT = Lexer.literalNames[Lexer.Exit];
export const DO = Lexer.literalNames[Lexer.Do];
export const CASE = Lexer.literalNames[Lexer.Case];
export const ELSE = Lexer.literalNames[Lexer.Else];
export const NEW = Lexer.literalNames[Lexer.New];
export const VAR = Lexer.literalNames[Lexer.Var];
export const GLOBAL_VAR = Lexer.literalNames[Lexer.GlobalVar];
export const CATCH = Lexer.literalNames[Lexer.Catch];
export const FINALLY = Lexer.literalNames[Lexer.Finally];
export const RETURN = Lexer.literalNames[Lexer.Return];
export const CONTINUE = Lexer.literalNames[Lexer.Continue];
export const FOR = Lexer.literalNames[Lexer.For];
export const SWITCH = Lexer.literalNames[Lexer.Switch];
export const WHILE = Lexer.literalNames[Lexer.While];
export const UNTIL = Lexer.literalNames[Lexer.Until];
export const REPEAT = Lexer.literalNames[Lexer.Repeat];
export const FUNCTION = Lexer.literalNames[Lexer.Function];
export const WITH = Lexer.literalNames[Lexer.With];
export const DEFAULT = Lexer.literalNames[Lexer.Default];
export const IF = Lexer.literalNames[Lexer.If];
export const THROW = Lexer.literalNames[Lexer.Throw];
export const DELETE = Lexer.literalNames[Lexer.Delete];
export const TRY = Lexer.literalNames[Lexer.Try];
export const ENUM = Lexer.literalNames[Lexer.Enum];
export const CONSTRUCTOR = Lexer.literalNames[Lexer.Constructor];
export const STATIC = Lexer.literalNames[Lexer.Static];
export const SELF = Lexer.literalNames[Lexer.Self];
export const OTHER = Lexer.literalNames[Lexer.Other];
export const ALL = Lexer.literalNames[Lexer.All];
export const MACRO = Lexer.literalNames[Lexer.Macro];
export const ESCAPED_NEW_LINE = Lexer.literalNames[Lexer.EscapedNewLine];
export const DEFINE = Lexer.literalNames[Lexer.Define];
export const REGION = Lexer.literalNames[Lexer.Region];
export const END_REGION = Lexer.literalNames[Lexer.EndRegion];
export const IDENTIFIER = Lexer.literalNames[Lexer.Identifier];
export const STRING_LITERAL = Lexer.literalNames[Lexer.StringLiteral];
export const TEMPLATE_STRING_START =
    Lexer.literalNames[Lexer.TemplateStringStart];
export const VERBATIM_STRING_LITERAL =
    Lexer.literalNames[Lexer.VerbatimStringLiteral];
export const WHITE_SPACES = Lexer.literalNames[Lexer.WhiteSpaces];
export const LINE_TERMINATOR = Lexer.literalNames[Lexer.LineTerminator];
export const UNEXPECTED_CHARACTER =
    Lexer.literalNames[Lexer.UnexpectedCharacter];
export const REGION_CHARACTERS = Lexer.literalNames[Lexer.RegionCharacters];
export const REGION_EOL = Lexer.literalNames[Lexer.RegionEOL];
export const TEMPLATE_STRING_END = Lexer.literalNames[Lexer.TemplateStringEnd];
export const TEMPLATE_STRING_START_EXPRESSION =
    Lexer.literalNames[Lexer.TemplateStringStartExpression];
export const TEMPLATE_STRING_TEXT =
    Lexer.literalNames[Lexer.TemplateStringText];
