import antlr4 from "antlr4";

import { isNonEmptyString } from "../../shared/utils.js";

const { ErrorListener } = antlr4.error;

export class GameMakerSyntaxError extends Error {
    constructor({ message, line, column, wrongSymbol, rule, offendingText }) {
        super(message);
        this.name = "GameMakerSyntaxError";
        if (Number.isFinite(line)) {
            this.line = line;
        }
        if (Number.isFinite(column)) {
            this.column = column;
        }
        if (typeof wrongSymbol === "string") {
            this.wrongSymbol = wrongSymbol;
        }
        if (typeof offendingText === "string") {
            this.offendingText = offendingText;
        }
        if (typeof rule === "string") {
            this.rule = rule;
        }
    }
}

export default class GameMakerParseErrorListener extends ErrorListener {
    // TODO: Provide better error messages.
    syntaxError(recognizer, offendingSymbol, line, column, _message, _error) {
        const parser = recognizer;
        const offendingText = resolveOffendingSymbolText(offendingSymbol);
        const wrongSymbol = formatWrongSymbol(offendingText);

        const stack = parser.getRuleInvocationStack();
        const currentRule = stack[0];

        const createError = (message) =>
            new GameMakerSyntaxError({
                message,
                line,
                column,
                wrongSymbol,
                rule: currentRule,
                offendingText
            });

        const specificMessage = getSpecificSyntaxErrorMessage({
            parser,
            stack,
            currentRule,
            line,
            column,
            wrongSymbol
        });

        if (specificMessage) {
            throw createError(specificMessage);
        }

        const currentRuleFormatted = currentRule
            .replaceAll(/([A-Z]+)*([A-Z][a-z])/g, "$1 $2")
            .toLowerCase();

        throw createError(
            `Syntax Error (line ${line}, column ${column}): ` +
                `unexpected ${wrongSymbol}` +
                ` while matching rule ${currentRuleFormatted}`
        );
    }
}

export class GameMakerLexerErrorListener extends ErrorListener {
    syntaxError(lexer, offendingSymbol, line, column, message, _error) {
        const offendingText =
            resolveOffendingSymbolText(offendingSymbol) ??
            extractOffendingTextFromLexerMessage(message);
        const wrongSymbol = formatWrongSymbol(offendingText);

        throw new GameMakerSyntaxError({
            message:
                `Syntax Error (line ${line}, column ${column}): ` +
                `unexpected ${wrongSymbol}`,
            line,
            column,
            wrongSymbol,
            offendingText
        });
    }
}

function resolveOffendingSymbolText(offendingSymbol) {
    if (!offendingSymbol) {
        return null;
    }

    if (isNonEmptyString(offendingSymbol?.text)) {
        return offendingSymbol.text;
    }

    if (isNonEmptyString(offendingSymbol)) {
        return offendingSymbol;
    }

    if (typeof offendingSymbol === "number") {
        const codePoint = offendingSymbol;
        if (Number.isFinite(codePoint)) {
            return String.fromCodePoint(codePoint);
        }
    }

    return null;
}

function extractOffendingTextFromLexerMessage(message) {
    if (!isNonEmptyString(message)) {
        return null;
    }

    const match = message.match(/token recognition error at:\s*(.+)$/i);
    if (!match) {
        return null;
    }

    const rawText = match[1].trim();

    if (rawText.length === 0) {
        return null;
    }

    if (
        rawText.startsWith("'") &&
        rawText.endsWith("'") &&
        rawText.length >= 2
    ) {
        return unescapeLexerToken(rawText.slice(1, -1));
    }

    return rawText;
}

function unescapeLexerToken(text) {
    if (!isNonEmptyString(text)) {
        return text;
    }

    return text.replaceAll(/\\([\\'])/g, "$1");
}

function formatWrongSymbol(offendingText) {
    if (offendingText === "<EOF>") {
        return "end of file";
    }

    if (isNonEmptyString(offendingText)) {
        return `symbol '${offendingText}'`;
    }

    return "unknown symbol";
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
            const openBraceToken = resolveOpenBlockStartToken(parser);
            if (!openBraceToken) {
                return null;
            }
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
        default: {
            return null;
        }
    }
}

/**
 * Safely resolve the start token for the open block that encloses the parser's
 * current context.
 *
 * @param {object} parser
 * @returns {object | null}
 */
function resolveOpenBlockStartToken(parser) {
    const currentContext = parser?._ctx;
    if (!currentContext) {
        return null;
    }

    const parentContext = currentContext.parentCtx;
    if (!parentContext || typeof parentContext.openBlock !== "function") {
        return null;
    }

    const openBlockContext = parentContext.openBlock();
    return openBlockContext?.start ?? null;
}
