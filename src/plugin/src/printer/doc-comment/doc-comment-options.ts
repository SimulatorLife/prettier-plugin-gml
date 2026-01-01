import { Core } from "@gml-modules/core";

type DocCommentPrinterOptions = Record<string, unknown> & {
    docCommentMaxWrapWidth?: number;
};

type ResolvedDocCommentPrinterOptions = DocCommentPrinterOptions & {
    docCommentMaxWrapWidth: number;
};

export function resolveDocCommentPrinterOptions(
    options?: DocCommentPrinterOptions
): ResolvedDocCommentPrinterOptions {
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride(process.env);

    const printWidth =
        typeof options?.printWidth === "number" ? options.printWidth : null;
    const resolvedWidth = Core.resolveDocCommentWrapWidth(options);
    const effectiveWidth =
        typeof printWidth === "number"
            ? Math.min(printWidth, resolvedWidth)
            : resolvedWidth;

    return {
        ...options,
        docCommentMaxWrapWidth: effectiveWidth
    };
}
