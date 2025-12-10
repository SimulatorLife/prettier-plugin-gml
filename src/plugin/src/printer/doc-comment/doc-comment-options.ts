import { Core } from "@gml-modules/core";

type DocCommentPrinterOptions = Record<string, unknown> & {
    docCommentMaxWrapWidth?: number  ;
};

type ResolvedDocCommentPrinterOptions = DocCommentPrinterOptions & {
    docCommentMaxWrapWidth: number  ;
};

export function resolveDocCommentPrinterOptions(
    options?: DocCommentPrinterOptions
): ResolvedDocCommentPrinterOptions {
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride(process.env);

    return {
        ...options,
        docCommentMaxWrapWidth: Core.resolveDocCommentWrapWidth(options)
    };
}
