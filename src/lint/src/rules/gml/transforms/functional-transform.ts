import * as Core from "@gml-modules/core";

export type ParserTransform<
    AstType extends Core.MutableGameMakerAstNode = Core.MutableGameMakerAstNode,
    Options extends Record<string, unknown> = Record<string, unknown>
> = Core.ParserTransform<AstType, Options>;

export type EmptyTransformOptions = Core.EmptyTransformOptions;

export const createParserTransform = Core.Core.createParserTransform;
