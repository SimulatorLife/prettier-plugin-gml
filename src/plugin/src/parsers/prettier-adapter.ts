import {
    gmlParserAdapter,
    type GmlParserAdapterOptions
} from "./gml-parser-adapter.js";
import type { GmlParserAdapter } from "../components/plugin-types.js";
import type { MutableGameMakerAstNode } from "@gml-modules/core";

/**
 * Adapter helpers that map Prettier-facing configuration into the parser
 * adapter options consumed by the shared `gmlParserAdapter`.
 */
export type PrettierGmlOptions = GmlParserAdapterOptions & {
    gmlStripComments?: boolean; // TODO: There are many more transforms than this, where/how are those being hooked up? Why is this one different? Need to de-dupe and consolidate the functionality and files.
};

export function mapPrettierOptionsToParserOptions(
    prettierOptions?: PrettierGmlOptions
): GmlParserAdapterOptions | undefined {
    if (!prettierOptions) {
        return undefined;
    }

    const { gmlStripComments, ...adapterOptions } = prettierOptions;
    if (Object.keys(adapterOptions).length === 0 && !gmlStripComments) {
        return undefined;
    }

    const normalized = { ...adapterOptions } as GmlParserAdapterOptions;

    if (gmlStripComments) {
        normalized.stripComments = true;
    }

    return normalized;
}

export function createPrettierParserAdapter(adapter: GmlParserAdapter) {
    return {
        ...adapter,
        parse(source: string, options?: PrettierGmlOptions) {
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
