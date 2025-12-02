import antlr4, { PredictionMode } from "antlr4";

import GameMakerLanguageLexer from "../../../generated/GameMakerLanguageLexer.js";
import GameMakerLanguageParser from "../../../generated/GameMakerLanguageParser.js";
import GameMakerASTBuilder from "../../ast/gml-ast-builder.js";
import type { ParserContextWithMethods } from "../../types/index.js";
import { defaultParserOptions } from "../../types/parser-types.js";
import GameMakerParseErrorListener, {
    GameMakerLexerErrorListener
} from "../../ast/gml-syntax-error.js";

export function parseExample(
    sourceText: string,
    options: { getLocations?: boolean; simplifyLocations?: boolean } = {
        getLocations: true,
        simplifyLocations: false
    }
) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    try {
        const chars = new antlr4.InputStream(sourceText);
        const lexer = new GameMakerLanguageLexer(chars);
        lexer.removeErrorListeners();
        lexer.addErrorListener(new GameMakerLexerErrorListener());
        lexer.strictMode = false;
        const tokens = new antlr4.CommonTokenStream(lexer);
        const parser = new GameMakerLanguageParser(tokens);

        parser._interp.predictionMode = PredictionMode.SLL;
        parser.removeErrorListeners();
        parser.addErrorListener(new GameMakerParseErrorListener());

        const tree = parser.program();
        const builder = new GameMakerASTBuilder(
            {
                ...defaultParserOptions,
                getLocations: options.getLocations ?? true,
                simplifyLocations: options.simplifyLocations ?? false
            },
            []
        );
        return builder.build(tree as ParserContextWithMethods);
    } catch {
        // Parsing example failed — return null and let caller handle absence
        return null;
    }
}
