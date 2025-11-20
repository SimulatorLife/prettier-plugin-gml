declare const ErrorListener: any;
export declare class GameMakerSyntaxError extends Error {
    constructor({ message, line, column, wrongSymbol, rule, offendingText }: {
        message: any;
        line: any;
        column: any;
        wrongSymbol: any;
        rule: any;
        offendingText: any;
    });
}
declare class SyntaxErrorFormatter {
    resolveOffendingSymbolText(offendingSymbol: any): any;
    extractOffendingTextFromLexerMessage(message: any): any;
    unescapeLexerToken(text: any): any;
    formatWrongSymbol(offendingText: any): string;
    formatRuleName(ruleName: any): any;
}
declare class ParserContextAnalyzer {
    resolveOpenBlockStartToken(parser: any): any;
    getSpecificErrorMessage({ parser, stack, currentRule, line, column, wrongSymbol }: {
        parser: any;
        stack: any;
        currentRule: any;
        line: any;
        column: any;
        wrongSymbol: any;
    }): string;
}
export default class GameMakerParseErrorListener extends ErrorListener {
    constructor({ formatter, contextAnalyzer }?: {
        formatter?: SyntaxErrorFormatter;
        contextAnalyzer?: ParserContextAnalyzer;
    });
    syntaxError(recognizer: any, offendingSymbol: any, line: any, column: any, _message: any, _error: any): void;
}
export declare class GameMakerLexerErrorListener extends ErrorListener {
    constructor({ formatter }?: {
        formatter?: SyntaxErrorFormatter;
    });
    syntaxError(lexer: any, offendingSymbol: any, line: any, column: any, message: any, _error: any): void;
}
export {};
