import GameMakerLanguageParserListenerBase from "../../generated/GameMakerLanguageParserListener.js";
import GameMakerLanguageParserVisitorBase from "../../generated/GameMakerLanguageParserVisitor.js";

type ParserListenerConstructor = new () => unknown;
type ParserVisitorConstructor = new () => unknown;

export type GameMakerLanguageParserBases = Readonly<{
    listener: ParserListenerConstructor;
    visitor: ParserVisitorConstructor;
}>;

const gameMakerLanguageParserBases: GameMakerLanguageParserBases =
    Object.freeze({
        listener:
            GameMakerLanguageParserListenerBase as ParserListenerConstructor,
        visitor: GameMakerLanguageParserVisitorBase as ParserVisitorConstructor
    });

/**
 * Provides stable access to the generated GameMaker language parser bases so runtime
 * wrappers do not couple directly to the generated module paths.
 */
export function getGameMakerLanguageParserBases(): GameMakerLanguageParserBases {
    return gameMakerLanguageParserBases;
}
