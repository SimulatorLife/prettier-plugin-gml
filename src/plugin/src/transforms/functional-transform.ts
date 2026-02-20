import {
    Core,
    type EmptyTransformOptions as CoreEmptyTransformOptions,
    type MutableGameMakerAstNode,
    type ParserTransform as CoreParserTransform
} from "@gml-modules/core";

export type ParserTransform<
    AstType extends MutableGameMakerAstNode = MutableGameMakerAstNode,
    Options extends Record<string, unknown> = Record<string, unknown>
> = CoreParserTransform<AstType, Options>;

export type EmptyTransformOptions = CoreEmptyTransformOptions;

export const createParserTransform = Core.createParserTransform;
