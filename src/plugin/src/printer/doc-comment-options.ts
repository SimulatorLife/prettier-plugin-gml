import { Core } from "@gml-modules/core";

export function resolveDocCommentPrinterOptions(options: any) {
    Core.docCommentMaxWrapWidthConfig.applyEnvOverride(process.env);

    return {
        ...options,
        docCommentMaxWrapWidth: Core.resolveDocCommentWrapWidth(options)
    };
}
