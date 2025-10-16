import { createDefaultGmlPluginComponents } from "./plugin-default-component-factory.js";

let componentFactory = createDefaultGmlPluginComponents;
let cachedComponents = null;

export function registerGmlPluginComponents(factory) {
    if (typeof factory !== "function") {
        throw new TypeError("factory must be a function");
    }

    componentFactory = factory;
    cachedComponents = null;
}

export function resolveGmlPluginComponents() {
    if (!cachedComponents) {
        const components = componentFactory();
        if (!components || typeof components !== "object") {
            throw new TypeError("GML plugin components must be an object");
        }

        const { parsers, printers, options } = components;
        if (!parsers || typeof parsers !== "object") {
            throw new TypeError("GML plugin components must include parsers");
        }
        if (!printers || typeof printers !== "object") {
            throw new TypeError("GML plugin components must include printers");
        }
        if (!options || typeof options !== "object") {
            throw new TypeError("GML plugin components must include options");
        }

        cachedComponents = { parsers, printers, options };
    }

    return cachedComponents;
}
