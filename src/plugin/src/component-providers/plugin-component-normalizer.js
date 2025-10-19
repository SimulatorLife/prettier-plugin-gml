function assertIsObjectLike(value, message) {
    if (!value || typeof value !== "object") {
        throw new TypeError(message);
    }
}

export function normalizeGmlPluginComponents(components) {
    assertIsObjectLike(components, "GML plugin components must be an object");

    const { parsers, printers, options } = components;

    assertIsObjectLike(parsers, "GML plugin components must include parsers");
    assertIsObjectLike(printers, "GML plugin components must include printers");
    assertIsObjectLike(options, "GML plugin components must include options");

    return Object.freeze({
        parsers: Object.freeze({ ...parsers }),
        printers: Object.freeze({ ...printers }),
        options: Object.freeze({ ...options })
    });
}
