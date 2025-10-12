parser grammar GameMakerLanguageParser;

options {tokenVocab=GameMakerLanguageLexer;}

program
    : statementList? EOF
    ;

statementList
    : statement+
    ;

statement
    : (block
    | emptyStatement
    | ifStatement
    | variableDeclarationList
    | iterationStatement
    | continueStatement
    | breakStatement
    | returnStatement
    | withStatement
    | switchStatement
    | tryStatement
    | throwStatement
    | exitStatement
    | macroStatement
    | defineStatement
    | regionStatement
    | enumeratorDeclaration
    | globalVarStatement
    | assignmentExpression
    | incDecStatement
    | callStatement
    | functionDeclaration
    | deleteStatement
    | literalStatement
    ) eos?
    ;

block
    : openBlock statementList? closeBlock
    ;

ifStatement
    : If expression Then? statement (Else statement)?
    ;

iterationStatement
    : Do statement Until expression # DoStatement
    | While expression statement # WhileStatement
    | For OpenParen
        (variableDeclarationList | assignmentExpression)? SemiColon
        expression? SemiColon
        statement?
    CloseParen statement # ForStatement
    | Repeat expression statement # RepeatStatement
    ;

withStatement
    : With expression statement
    ;

switchStatement
    : Switch expression caseBlock
    ;

continueStatement
    : Continue
    ;

breakStatement
    : Break
    ;

exitStatement
    : Exit
    ;

emptyStatement
    : SemiColon
    ;

caseBlock
    : openBlock caseClauses? (defaultClause caseClauses?)? closeBlock
    ;

caseClauses
    : caseClause+
    ;

caseClause
    : Case expression Colon statementList?
    ;

defaultClause
    : Default Colon statementList?
    ;

throwStatement
    : Throw expression
    ;

tryStatement
    : Try statement (catchProduction finallyProduction? | finallyProduction)
    ;

catchProduction
    : Catch (OpenParen identifier? CloseParen)? statement
    ;

finallyProduction
    : Finally statement
    ;

returnStatement
    : Return expression?
    ;

deleteStatement
    : Delete expression
    ;

literalStatement
    : literal
    ;

assignmentExpression
    : lValueExpression assignmentOperator expressionOrFunction
    ;

variableDeclarationList
    : varModifier variableDeclaration (Comma variableDeclaration)*
    ;

varModifier
    : Var+
    | Static
    ;

variableDeclaration
    : identifier (Assign expressionOrFunction)?
    ;

globalVarStatement
    : GlobalVar identifier (Comma identifier)* SemiColon
    ;

newExpression
    : New identifier arguments
    ;

lValueStartExpression
    : identifier # IdentifierLValue
    | newExpression # NewLValue
    ;

lValueExpression
    : lValueStartExpression (lValueChainOperator* lValueFinalOperator)?
    ;

lValueChainOperator
    : accessor expressionSequence CloseBracket # MemberIndexLValue
    | Dot identifier # MemberDotLValue
    | arguments # CallLValue
    ;

lValueFinalOperator
    : accessor expressionSequence CloseBracket # MemberIndexLValueFinal
    | Dot identifier # MemberDotLValueFinal
    ;

expressionSequence
    : expression (Comma expression)*
    ;

expressionOrFunction
    : expression 
    | functionDeclaration
    ;

expression
    : OpenParen expression CloseParen # ParenthesizedExpression
    | <assoc=right> Minus expression # UnaryMinusExpression
    | <assoc=right> BitNot expression # BitNotExpression
    | <assoc=right> Not expression # NotExpression
    | expression (Multiply | Divide | IntegerDivide | Modulo) expression # BinaryExpression
    | expression (Plus | Minus) expression # BinaryExpression
    | expression (LeftShiftArithmetic | RightShiftArithmetic) expression # BinaryExpression
    | expression BitAnd expression # BinaryExpression
    | expression BitXOr expression # BinaryExpression
    | expression BitOr expression # BinaryExpression
    | expression (Equals | NotEquals) expression # BinaryExpression
    | expression (LessThan | MoreThan | LessThanEquals | GreaterThanEquals) expression # BinaryExpression
    | <assoc=right> expression NullCoalesce expression # BinaryExpression
    | expression And expression # BinaryExpression
    | expression Or expression # BinaryExpression
    | expression Xor expression # BinaryExpression
    | ( preIncDecExpression | postIncDecExpression ) # IncDecExpression
    | lValueExpression # VariableExpression
    | callStatement # CallExpression
    | <assoc=right> expression QuestionMark expression Colon expression # TernaryExpression
    | literal # LiteralExpression
    ;

callStatement
    : callableExpression arguments
    | callStatement arguments
    ;

callableExpression
    : lValueExpression
    | OpenParen (functionDeclaration | callableExpression) CloseParen
    ;

preIncDecExpression
    : (PlusPlus | MinusMinus) lValueExpression # PreIncDecStatement
    ;

postIncDecExpression
    : lValueExpression (PlusPlus | MinusMinus) # PostIncDecStatement
    ;

incDecStatement
    : postIncDecExpression 
    | preIncDecExpression 
    ;

accessor
    : OpenBracket
    | ListAccessor
    | MapAccessor
    | GridAccessor
    | ArrayAccessor
    | StructAccessor
    ;

arguments
    : OpenParen CloseParen
    | OpenParen argumentList? trailingComma? CloseParen
    ;

argumentList
    : Comma argument (Comma argument)*
    | argument Comma argument (Comma argument)*
    | argument
    ;

argument
    : expressionOrFunction
    | UndefinedLiteral
    | /* empty, to represent a missing argument */
    ;

trailingComma
    : Comma
    ;

assignmentOperator
    : MultiplyAssign
    | DivideAssign
    | ModulusAssign
    | PlusAssign
    | MinusAssign
    | LeftShiftArithmeticAssign
    | RightShiftArithmeticAssign
    | BitAndAssign
    | BitXorAssign
    | BitOrAssign
    | NullCoalescingAssign
    | Assign
    ;

literal
    : UndefinedLiteral
    | NoOneLiteral
    | BooleanLiteral
    | StringLiteral
    | VerbatimStringLiteral
    | templateStringLiteral
    | HexIntegerLiteral
    | BinaryLiteral
    | DecimalLiteral
    | IntegerLiteral
    | arrayLiteral
    | structLiteral
    ;

templateStringLiteral
    : TemplateStringStart templateStringAtom* TemplateStringEnd
    ;

templateStringAtom
    : TemplateStringText
    | TemplateStringStartExpression expression TemplateStringEndExpression
    ;

arrayLiteral
    : OpenBracket elementList CloseBracket
    ;

elementList
    : Comma* expressionOrFunction? (Comma+ expressionOrFunction)* Comma? // Yes, everything is optional
    ;

structLiteral
    : openBlock (propertyAssignment (Comma propertyAssignment)* Comma?)? closeBlock
    ;

propertyAssignment
    : propertyIdentifier Colon expressionOrFunction
    ;

propertyIdentifier
    : Identifier | softKeyword | propertySoftKeyword
    ;

functionDeclaration
    : Function_ Identifier? parameterList constructorClause? block
    ;

constructorClause
    : (Colon Identifier parameterList)? Constructor
    ;

parameterList
    : OpenParen (parameterArgument (Comma parameterArgument)* Comma?)? CloseParen
    ;

parameterArgument
    : identifier (Assign expressionOrFunction)?
    ;

identifier
    : Identifier | softKeyword
    ;

enumeratorDeclaration
    : Enum identifier openBlock (enumeratorList)? closeBlock
    ;

enumeratorList
    : enumerator (Comma enumerator)* Comma?
    ;

enumerator
    : identifier (Assign (IntegerLiteral | HexIntegerLiteral | BinaryLiteral))?
    ;

macroStatement
    : Macro identifier macroToken+ (LineTerminator | EOF)
    ;

defineStatement
    : Define RegionCharacters (RegionEOL | EOF)
    ;

regionStatement
    : (Region | EndRegion) RegionCharacters? (RegionEOL | EOF)
    ;

// handles macros used as statements
identifierStatement
    : identifier
    ;

softKeyword
    : Constructor
    ;

propertySoftKeyword
    : NoOneLiteral
    ;

openBlock
    : OpenBrace | Begin
    ;

closeBlock
    : CloseBrace | End
    ;

eos
    : SemiColon
    ;

// every token except:
// WhiteSpaces, LineTerminator, Define, Macro, Region, EndRegion, UnexpectedCharacter
// includes EscapedNewLine
macroToken
    : EscapedNewLine | OpenBracket | CloseBracket | OpenParen | CloseParen
    | OpenBrace | CloseBrace | Begin | End | SemiColon | Comma | Assign | Colon
    | Dot | PlusPlus | MinusMinus | Plus | Minus | BitNot | Not | Multiply | Divide
    | IntegerDivide | Modulo | Power | QuestionMark | NullCoalesce
    | NullCoalescingAssign | RightShiftArithmetic | LeftShiftArithmetic
    | LessThan | MoreThan | LessThanEquals | GreaterThanEquals | Equals | NotEquals
    | BitAnd | BitXOr | BitOr | And | Or | Xor | MultiplyAssign | DivideAssign | PlusAssign
    | MinusAssign | ModulusAssign | LeftShiftArithmeticAssign | RightShiftArithmeticAssign
    | BitAndAssign | BitXorAssign | BitOrAssign | NumberSign | DollarSign | AtSign
    | UndefinedLiteral | NoOneLiteral | BooleanLiteral | IntegerLiteral | DecimalLiteral
    | BinaryLiteral | HexIntegerLiteral | Break | Exit | Do | Case | Else | New
    | Var | GlobalVar | Catch | Finally | Return | Continue | For | Switch | While
    | Until | Repeat | Function_ | With | Default | If | Then | Throw | Delete
    | Try | Enum | Constructor | Static | Identifier | StringLiteral | VerbatimStringLiteral
    | TemplateStringStart | TemplateStringEnd | TemplateStringText | TemplateStringStartExpression
    | TemplateStringEndExpression | OpenBracket | ListAccessor | MapAccessor | GridAccessor | ArrayAccessor
    | StructAccessor
    ;
