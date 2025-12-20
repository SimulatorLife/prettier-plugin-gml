// Public facade for parser adapters used by the Prettier plugin
export {
    gmlParserAdapter,
    createGmlParserAdapter
} from "./gml-parser-adapter.js";
export type {
    ScopeTrackerFactory,
    GmlParserAdapterConfig,
    GmlParserAdapterOptions
} from "./gml-parser-adapter.js";
export {
    prettierParserAdapter,
    createPrettierParserAdapter,
    mapPrettierOptionsToParserOptions
} from "./prettier-adapter.js";
export type { PrettierGmlOptions } from "./prettier-adapter.js";
export {
    fixMalformedComments,
    recoverParseSourceFromMissingBrace
} from "./source-preprocessing.js";
export type { CommentFixResult } from "./source-preprocessing.js";
