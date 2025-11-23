import { Core } from "@gml-modules/core";

import type { GmlPluginComponentBundle } from "./plugin-types.js";

export function normalizeGmlPluginComponents(
    components: unknown
): GmlPluginComponentBundle {
    const normalized = Core.assertPlainObject(components, {
        errorMessage: "GML plugin components must be an object."
    }) as Partial<GmlPluginComponentBundle> & Record<string, unknown>;

    const { parsers, printers, options } = normalized;

    Core.assertPlainObject(parsers, {
        errorMessage: "GML plugin components must include parsers."
    });
    Core.assertPlainObject(printers, {
        errorMessage: "GML plugin components must include printers."
    });
    Core.assertPlainObject(options, {
        errorMessage: "GML plugin components must include options."
    });

    return Object.freeze({
        parsers: Object.freeze({
            ...(parsers as GmlPluginComponentBundle["parsers"])
        }),
        printers: Object.freeze({
            ...(printers as GmlPluginComponentBundle["printers"])
        }),
        options: Object.freeze({
            ...(options as GmlPluginComponentBundle["options"])
        })
    });
}
