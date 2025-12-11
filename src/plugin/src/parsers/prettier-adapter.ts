import {
    gmlParserAdapter,
    type GmlParserAdapterOptions
} from "./gml-parser-adapter.js";
import type { GmlParserAdapter } from "../components/plugin-types.js";
import type { MutableGameMakerAstNode } from "@gml-modules/core";

export type PrettierGmlOptions = GmlParserAdapterOptions;

/**
 * Bridges Prettier’s `parser.parse` options into the parser adapter by
 * normalizing the available GML-specific options without introducing an
 * additional shape that would duplicate the parser contract.
 */
export function mapPrettierOptionsToParserOptions(
    prettierOptions?: GmlParserAdapterOptions
): GmlParserAdapterOptions | undefined {
    if (!prettierOptions) {
        return undefined;
    }

    if (Object.keys(prettierOptions).length === 0) {
        return undefined;
    }
    return { ...prettierOptions };
}

/**
 * Wraps the shared `gmlParserAdapter` so the Prettier parser entry point can
 * pass in the same option shape the plugin exposes while staying compatible with
 * the parser adapter interface. The wrapper simply forwards the normalized
 * options to the runtime adapter.
 */
export function createPrettierParserAdapter(adapter: GmlParserAdapter) {
    return {
        ...adapter,
        /**
         * Expose the same interface Prettier expects but pass normalized options
         * through to the actual parser adapter so the shared transforms reuse a
         * single option shape.
         */
        parse(source: string, options?: GmlParserAdapterOptions) {
            const parserOptions = mapPrettierOptionsToParserOptions(options);
            const runtimeParse = adapter.parse as (
                text: string,
                options?: GmlParserAdapterOptions
            ) => Promise<MutableGameMakerAstNode>;
            return runtimeParse(source, parserOptions);
        }
    };
}

export const prettierParserAdapter =
    createPrettierParserAdapter(gmlParserAdapter);
