import { Core } from "@gml-modules/core";

type DocCommentPrinterOptions = Record<string, unknown> & {
    printWidth?: number;
};

type ResolvedDocCommentPrinterOptions = DocCommentPrinterOptions & {
    printWidth: number;
};

export function resolveDocCommentPrinterOptions(
    options?: DocCommentPrinterOptions
): ResolvedDocCommentPrinterOptions {
    const printWidth = Core.coercePositiveIntegerOption(
        options?.printWidth,
        120
    );

    return {
        ...options,
        printWidth
    };
}
