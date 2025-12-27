import type { MutableGameMakerAstNode } from "@gml-modules/core";

/**
 * Shared base for parser transforms so each transform in this directory follows a consistent API.
 */
type TransformOptions = Record<string, unknown>;
export type EmptyTransformOptions = Record<string, never>;

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

/**
 * Base class that handles option merging and enforces the `execute` contract for subclasses.
 */
export abstract class FunctionalParserTransform<
    Options extends TransformOptions = EmptyTransformOptions
> implements ParserTransform<MutableGameMakerAstNode, Options> {
    public readonly name: string;
    public readonly defaultOptions: Options;

    constructor(name: string, defaultOptions: Options) {
        this.name = name;
        this.defaultOptions = Object.freeze({ ...defaultOptions }) as Options;
    }

    public transform(
        ast: MutableGameMakerAstNode,
        options?: Options
    ): MutableGameMakerAstNode {
        const resolvedOptions = options
            ? (Object.assign({}, this.defaultOptions, options) as Options)
            : this.defaultOptions;

        return this.execute(ast, resolvedOptions);
    }

    protected abstract execute(
        ast: MutableGameMakerAstNode,
        options: Options
    ): MutableGameMakerAstNode;
}

export default FunctionalParserTransform;
