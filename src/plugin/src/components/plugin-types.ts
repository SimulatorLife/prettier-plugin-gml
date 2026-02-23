import type { MutableGameMakerAstNode } from "@gml-modules/core";
import type { Parser, ParserOptions, Plugin, Printer, SupportOptions } from "prettier";

export type GmlAst = MutableGameMakerAstNode;

export type GmlParserAdapter = Parser<GmlAst>;
export type GmlPrinter = Printer<GmlAst>;

export type GmlPrintFunction = NonNullable<GmlPrinter["print"]>;
export type GmlPrintCommentFunction = NonNullable<GmlPrinter["printComment"]>;
export type GmlHandleComments = NonNullable<GmlPrinter["handleComments"]>;

export type LogicalOperatorsStyleMap = Readonly<{
    KEYWORDS: string;
    SYMBOLS: string;
}>;

export type GmlPluginComponentContract = Readonly<{
    gmlParserAdapter: GmlParserAdapter;
    print: GmlPrintFunction;
    handleComments: GmlHandleComments;
    printComment: GmlPrintCommentFunction;
    identifierCaseOptions: SupportOptions;
    LogicalOperatorsStyle: LogicalOperatorsStyleMap;
}>;

export type GmlPluginComponentBundle = Readonly<{
    parsers: Readonly<Record<string, GmlParserAdapter>>;
    printers: Readonly<Record<string, GmlPrinter>>;
    options: SupportOptions;
}>;

export type GmlPluginDefaultOptions = Record<string, unknown>;

export type GmlPlugin = Omit<Plugin<GmlAst>, "defaultOptions"> & {
    defaultOptions?: GmlPluginDefaultOptions;
    pluginOptions?: SupportOptions;
    format: (source: string, options?: Record<string, unknown>) => Promise<string>;
    /**
     * Layout-only post-processing pass applied after Prettier formats the GML
     * source. Owned by the plugin (formatter) workspace because all of its
     * transforms are purely layout-level (blank-line collapsing, whitespace
     * normalization, etc.). Content/semantic rewrites are never applied here;
     * those belong in the `@gml-modules/lint` workspace.
     */
    normalizeFormattedOutput: (formatted: string) => string;
};

export type GmlParserOptions = ParserOptions<GmlAst>;
