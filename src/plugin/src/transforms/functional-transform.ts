import type { MutableGameMakerAstNode, ParserTransform as CoreParserTransform } from "@gml-modules/core";

export type ParserTransform<
    AstType extends MutableGameMakerAstNode = MutableGameMakerAstNode,
    Options extends Record<string, unknown> = Record<string, unknown>
> = CoreParserTransform<AstType, Options>;

export type { EmptyTransformOptions } from "@gml-modules/core";
export { createParserTransform } from "@gml-modules/core";
