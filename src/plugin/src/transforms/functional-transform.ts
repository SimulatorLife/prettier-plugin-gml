import type { MutableGameMakerAstNode } from "@gml-modules/core";

/**
 * Shared base for parser transforms so each transform in this directory follows a consistent API.
 */
type TransformOptions = Record<string, unknown>;

/**
 * Minimal interface implemented by transforms that mutate a GML AST in a predictable way.
 */
export interface ParserTransform<
    AstType extends MutableGameMakerAstNode = MutableGameMakerAstNode,
    Options extends TransformOptions = TransformOptions
> {
    readonly name: string;
    readonly defaultOptions: Options;
    transform(ast: AstType, options?: Options): AstType;
}
