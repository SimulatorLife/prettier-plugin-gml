declare module "antlr4" {
    export class InputStream {
        constructor(input: string);
    }

    export interface TokenStream {
        LT(i: number): Token | null | undefined;
        index: number;
        [key: string]: unknown;
    }

    export class CommonTokenStream implements TokenStream {
        constructor(lexer: Lexer);
        LT(i: number): Token | null;
        index: number;
    }

    export type LexerState = number;

export class Token {
    static INVALID_TYPE: number;
    static EOF: number;
    type: number;
    text?: string;
    line?: number;
    column?: number;
    tokenIndex?: number;
    start?: Token;
    stop?: Token;
    symbol?: Token;
    startIndex?: number;
    stopIndex?: number;
    channel?: number;
    [key: string]: unknown;
    constructor(source: Lexer | null, type: number, channel?: number);
}

    export class Recognizer {
        _ctx?: ParserRuleContext | null;
        getTokenStream?(): TokenStream | null;
        getCurrentToken?(): Token | null;
    }

    export class Lexer extends Recognizer {
        strictMode: boolean;
        removeErrorListeners(): void;
        addErrorListener(listener: ErrorListener): void;
        [key: string]: unknown;
    }

    export class Parser extends Recognizer {
        removeErrorListeners(): void;
        addErrorListener(listener: ErrorListener): void;
        [key: string]: unknown;
    }

    export class ErrorListener {
        syntaxError(): void;
    }

    export class ParserRuleContext {
        parentCtx?: ParserRuleContext | null;
        start?: Token;
        stop?: Token;
        openBlock?(): ParserRuleContext | null;
        getRuleInvocationStack(): Array<string>;
        [key: string]: unknown;
    }

    export class RecognitionException extends Error {
        ctx?: ParserRuleContext | null;
        context?: ParserRuleContext | null;
        offendingToken?: Token | null;
        offendingSymbol?: Token | null;
        offendingState?: number;
        startToken?: Token | null;
        expectedTokens?: { toString(): string } | null;
        _input?: TokenStream | null;
        getOffendingToken?(): Token | null;
    }

    export class DefaultErrorStrategy {
        reportNoViableAlternative(
            recognizer: Recognizer,
            exception: RecognitionException | null
        ): void;
    }

    export namespace tree {
        export class ParseTreeVisitor {
            visit(ctx: ParserRuleContext | null | undefined): unknown;
            visitChildren(ctx: ParserRuleContext | null | undefined): unknown;
        }

        export class ParseTreeListener {
            visitChildren?(ctx: ParserRuleContext | null | undefined): unknown;
            visitTerminal?(node: Token): unknown;
            visitErrorNode?(node: Token): unknown;
        }
    }

    export namespace atn {
        export const PredictionMode: {
            SLL: number;
            LL: number;
        };
    }

    export const PredictionMode: {
        SLL: number;
        LL: number;
    };
}
