import antlr4 from "antlr4";

export default class GameMakerParseErrorListener extends antlr4.error.ErrorListener {
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

        if (currentRule == "closeBlock") {
            const openBraceToken = parser._ctx.parentCtx.openBlock().start;
            if (stack[1] === "block") {
                throw (
                    `Syntax Error (line ${openBraceToken.line}, column ${openBraceToken.column}): ` +
                    "missing associated closing brace for this block"
                );
            }
        }

        if (currentRule == "expression") {
            throw (
                `Syntax Error (line ${line}, column ${column}): ` +
                `unexpected ${wrongSymbol} in expression`
            );
        }

        if (currentRule == "statement") {
            throw (
                `Syntax Error (line ${line}, column ${column}): ` +
                `unexpected ${wrongSymbol}`
            );
        }

        if (currentRule == "lValueExpression" && stack[1] == "incDecStatement") {
            throw (
                `Syntax Error (line ${line}, column ${column}): ` +
                "++, -- can only be used on a variable-addressing expression"
            );
        }

        // *refuses to elaborate further*
        if (currentRule === "program") {
            throw (
                `Syntax Error (line ${line}, column ${column}): ` +
                `unexpected ${wrongSymbol}`
            );
        }

        if (currentRule == "parameterList") {
            throw (
                `Syntax Error (line ${line}, column ${column}): ` +
                `unexpected ${wrongSymbol} in function parameters, expected an identifier`
            );
        }

        const currentRuleFormatted = currentRule
            .replace(/([A-Z]+)*([A-Z][a-z])/g, "$1 $2")
            .toLowerCase();

        throw (
            `Syntax Error (line ${line}, column ${column}): ` +
            `unexpected ${wrongSymbol}`
            + ` while matching rule ${currentRuleFormatted}`
        );
    }
}