import type {
    EmptyTransformOptions as CoreEmptyTransformOptions,
    MutableGameMakerAstNode,
    ParserTransform as CoreParserTransform} from "@gml-modules/core";
import { Core } from "@gml-modules/core";

export type ParserTransform<
    AstType extends MutableGameMakerAstNode = MutableGameMakerAstNode,
    Options extends Record<string, unknown> = Record<string, unknown>
> = CoreParserTransform<AstType, Options>;

export type EmptyTransformOptions = CoreEmptyTransformOptions;

export const createParserTransform = Core.createParserTransform;
