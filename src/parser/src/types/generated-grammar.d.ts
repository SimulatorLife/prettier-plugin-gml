import type * as antlr4 from "antlr4";

declare module "../generated/GameMakerLanguageLexer.js" {
    const GameMakerLanguageLexer: any;
    export default GameMakerLanguageLexer;
}

declare module "../generated/GameMakerLanguageParser.js" {
    const GameMakerLanguageParser: any;
    export default GameMakerLanguageParser;
}

declare module "../generated/GameMakerLanguageParserListener.js" {
    import type { ParserRuleContext } from "antlr4";

    export default class GameMakerLanguageParserListener
        extends antlr4.tree.ParseTreeListener
    {
        enterProgram(ctx: ParserRuleContext): void;
        exitProgram(ctx: ParserRuleContext): void;
        [methodName: string]: ((ctx: ParserRuleContext) => void) | undefined;
    }
}

declare module "../generated/GameMakerLanguageParserVisitor.js" {
    import type { ParserRuleContext } from "antlr4";

    export default class GameMakerLanguageParserVisitor
        extends antlr4.tree.ParseTreeVisitor
    {
        visit(ctx: ParserRuleContext): unknown;
        visitChildren(ctx: ParserRuleContext): unknown;
        [methodName: string]:
            | ((ctx: ParserRuleContext) => unknown)
            | ((ctx: ParserRuleContext, ...args: Array<unknown>) => unknown)
            | undefined;
    }
}
