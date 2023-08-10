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
    | For '('
        (variableDeclarationList | assignmentExpression)? ';'
        expression? ';'
        statement?
    ')' statement # ForStatement
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
    : Case expression ':' statementList?
    ;

defaultClause
    : Default ':' statementList?
    ;

throwStatement
    : Throw expression
    ;

tryStatement
    : Try statement (catchProduction finallyProduction? | finallyProduction)
    ;

catchProduction
    : Catch ('(' identifier? ')')? statement
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

assignmentExpression
    : lValueExpression assignmentOperator expressionOrFunction
    ;

variableDeclarationList
    : varModifier variableDeclaration (',' variableDeclaration)*
    ;

varModifier
    : Var+
    | Static
    ;

variableDeclaration
    : identifier (Assign expressionOrFunction)?
    ;

globalVarStatement
    : GlobalVar identifier (',' identifier)* SemiColon
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
    : accessor expressionSequence ']' # MemberIndexLValue
    | '.' identifier # MemberDotLValue
    | arguments # CallLValue
    ;

lValueFinalOperator
    : accessor expressionSequence ']' # MemberIndexLValueFinal
    | '.' identifier # MemberDotLValueFinal
    ;

expressionSequence
    : expression (',' expression)*
    ;

expressionOrFunction
    : expression 
    | functionDeclaration
    ;

expression
    : ( preIncDecExpression
      | postIncDecExpression ) # IncDecExpression
    | lValueExpression # VariableExpression
    | callStatement # CallExpression

    | <assoc=right> '-' expression # UnaryMinusExpression
    | <assoc=right> '~' expression # BitNotExpression
    | <assoc=right> Not expression # NotExpression

    | expression ('*' | '/' | Modulo | IntegerDivide) expression # MultiplicativeExpression
    | expression ('+' | '-') expression # AdditiveExpression
    | expression '??' expression # CoalesceExpression
    | expression ('<<' | '>>') expression # BitShiftExpression
    | expression Or expression # LogicalOrExpression
    | expression And expression # LogicalAndExpression
    | expression Xor expression # LogicalXorExpression
    | expression ('==' | Assign | NotEquals) expression # EqualityExpression
    | expression ('<' | '>' | '<=' | '>=') expression # RelationalExpression
    | expression '&' expression # BitAndExpression
    | expression '|' expression # BitOrExpression
    | expression '^' expression # BitXOrExpression

    | expression '?' expression ':' expression # TernaryExpression
    | literal # LiteralExpression
    | '(' expression ')' # ParenthesizedExpression
    ;

callStatement
    : callableExpression arguments
    | callStatement arguments
    ;

callableExpression
    : lValueExpression
    | '(' (functionDeclaration | callableExpression) ')'
    ;

preIncDecExpression
    : ('++' | '--') lValueExpression # PreIncDecStatement
    ;

postIncDecExpression
    : lValueExpression ('++' | '--') # PostIncDecStatement
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
    : '(' ')'
    | '(' argumentList? trailingComma? ')'
    ;

argumentList
    : ',' argument (',' argument)*
    | argument ',' argument (',' argument)*
    | argument
    ;

argument
    : expressionOrFunction
    | UndefinedLiteral
    | /* empty, to represent a missing argument */
    ;

trailingComma
    : ',' 
    ;

assignmentOperator
    : '*='
    | '/='
    | '%='
    | '+='
    | '-='
    | '<<='
    | '>>='
    | '&='
    | '^='
    | '|='
    | '??='
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
    : '[' elementList ']'
    ;

elementList
    : ','* expressionOrFunction? (','+ expressionOrFunction)* ','? // Yes, everything is optional
    ;

structLiteral
    : openBlock (propertyAssignment (',' propertyAssignment)* ','?)? closeBlock
    ;

propertyAssignment
    : propertyIdentifier ':' expressionOrFunction
    ;

propertyIdentifier
    : Identifier | softKeyword | propertySoftKeyword
    ;

functionDeclaration
    : Function_ Identifier? parameterList constructorClause? block
    ;

constructorClause
    : (':' Identifier parameterList)? Constructor
    ;

parameterList
    : '(' (parameterArgument (',' parameterArgument)* ','?)? ')'
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
    : enumerator (',' enumerator)* ','?
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
    | LessThan | MoreThan | LessThanEquals | GreaterThanEquals | Equals_ | NotEquals
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