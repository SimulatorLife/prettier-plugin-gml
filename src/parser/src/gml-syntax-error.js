import antlr4 from "antlr4";

export default class GameMakerParseErrorListener extends antlr4.error
    .ErrorListener {
    constructor() {
        super();
    }

    // TODO: better error messages
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        const parser = recognizer;
        let wrongSymbol = offendingSymbol.text;

        if (wrongSymbol === "<EOF>") {
            wrongSymbol = "end of file";
        } else {
            wrongSymbol = `symbol '${wrongSymbol}'`;
        }

        const tokens = parser.getInputStream();
        const stack = parser.getRuleInvocationStack();
        const currentRule = stack[0];

        const specificMessage = getSpecificSyntaxErrorMessage({
            parser,
            stack,
            currentRule,
            line,
            column,
            wrongSymbol
        });

        if (specificMessage) {
            throw specificMessage;
        }

        const currentRuleFormatted = currentRule
            .replace(/([A-Z]+)*([A-Z][a-z])/g, "$1 $2")
            .toLowerCase();

        throw (
            `Syntax Error (line ${line}, column ${column}): ` +
      `unexpected ${wrongSymbol}` +
      ` while matching rule ${currentRuleFormatted}`
        );
    }
}

function getSpecificSyntaxErrorMessage({
    parser,
    stack,
    currentRule,
    line,
    column,
    wrongSymbol
}) {
    switch (currentRule) {
        case "closeBlock": {
            if (stack[1] !== "block") {
                return null;
            }
            const openBraceToken = parser._ctx.parentCtx.openBlock().start;
            return (
                `Syntax Error (line ${openBraceToken.line}, column ${openBraceToken.column}): ` +
        "missing associated closing brace for this block"
            );
        }
        case "lValueExpression": {
            if (stack[1] !== "incDecStatement") {
                return null;
            }
            return (
                `Syntax Error (line ${line}, column ${column}): ` +
        "++, -- can only be used on a variable-addressing expression"
            );
        }
        case "expression": {
            return (
                `Syntax Error (line ${line}, column ${column}): ` +
        `unexpected ${wrongSymbol} in expression`
            );
        }
        case "statement":
        case "program": {
            return (
                `Syntax Error (line ${line}, column ${column}): ` +
        `unexpected ${wrongSymbol}`
            );
        }
        case "parameterList": {
            return (
                `Syntax Error (line ${line}, column ${column}): ` +
        `unexpected ${wrongSymbol} in function parameters, expected an identifier`
            );
        }
        default:
            return null;
    }
}
