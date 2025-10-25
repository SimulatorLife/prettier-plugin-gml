import { assertPlainObject } from "../shared/index.js";

export function normalizeGmlPluginComponents(components) {
    assertPlainObject(components, {
        errorMessage: "GML plugin components must be an object"
    });

    const { parsers, printers, options } = components;

    assertPlainObject(parsers, {
        errorMessage: "GML plugin components must include parsers"
    });
    assertPlainObject(printers, {
        errorMessage: "GML plugin components must include printers"
    });
    assertPlainObject(options, {
        errorMessage: "GML plugin components must include options"
    });

    return Object.freeze({
        parsers: Object.freeze({ ...parsers }),
        printers: Object.freeze({ ...printers }),
        options: Object.freeze({ ...options })
    });
}
