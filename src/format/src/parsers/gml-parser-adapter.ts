// Thin adapter that bridges the Prettier parser contract to the GameMaker
// parser implementation. Keeping this logic in one place avoids sprinkling
// knowledge of the parser's option shape and location metadata across the
// rest of the formatter configuration.

import { Core, type MutableGameMakerAstNode } from "@gmloop/core";
import { Parser } from "@gmloop/parser";

const PARSER_OPTIONS = {
    getLocations: true,
    simplifyLocations: false,
    getComments: true,
    // Attach legacy `@function`/`@func` comments to their function declarations
    // during parsing so formatter output stays stable for existing fixtures.
    // This remains formatter-safe because the parser only wires comment
    // ownership; it does not rewrite doc tag content.
    attachFunctionDocComments: true
} as const;

function parse(text: string): MutableGameMakerAstNode {
    const ast = Parser.GMLParser.parse(text, PARSER_OPTIONS) as MutableGameMakerAstNode;

    if (!Core.isObjectLike(ast)) {
        throw new TypeError("GameMaker parser returned no AST for the provided source.");
    }

    // Default to flattening synthetic numeric parentheses to match standard Prettier behavior
    // and pass existing tests.
    (ast as any)._flattenSyntheticNumericParens = true;

    return ast;
}

function locStart(node: MutableGameMakerAstNode): number {
    if (!node || node.type === "Program") {
        return 0;
    }

    return Core.getNodeStartIndex(node) ?? 0;
}

function locEnd(node: MutableGameMakerAstNode): number {
    return Core.getNodeEndIndex(node) ?? 0;
}

export const gmlParserAdapter = {
    parse,
    astFormat: "gml-ast" as const,
    locStart,
    locEnd
};
