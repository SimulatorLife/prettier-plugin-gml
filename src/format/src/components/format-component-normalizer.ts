import { Core } from "@gml-modules/core";

import type { GmlFormatComponentBundle } from "./format-types.js";

export function normalizeGmlFormatComponents(components: unknown): GmlFormatComponentBundle {
    const normalized = Core.assertPlainObject(components, {
        errorMessage: "GML format components must be an object."
    }) as Partial<GmlFormatComponentBundle> & Record<string, unknown>;

    const { parsers, printers, options } = normalized;

    Core.assertPlainObject(parsers, {
        errorMessage: "GML format components must include parsers."
    });
    Core.assertPlainObject(printers, {
        errorMessage: "GML format components must include printers."
    });
    Core.assertPlainObject(options, {
        errorMessage: "GML format components must include options."
    });

    return Object.freeze({
        parsers: Object.freeze({
            ...parsers
        }),
        printers: Object.freeze({
            ...printers
        }),
        options: Object.freeze({
            ...options
        })
    });
}
