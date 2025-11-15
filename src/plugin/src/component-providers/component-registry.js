import { Core } from "@gml-modules/core";
const {
    Utils: { assertFunction }
} = Core;

/**
 * Creates an immutable singleton registry around a bundle factory.
 *
 * Both the eagerly-computed bundle and the resolver function are returned so
 * callers can expose the snapshot via named exports without re-implementing
 * the same "freeze and re-expose" plumbing for each bundle type.
 *
 * @template T
 * @param {object} options
 * @param {string} options.description
 *        Human-friendly description used in error messages.
 * @param {() => T} options.factory
 *        Function that produces the bundle snapshot.
 */
export function createSingletonComponentRegistry({ description, factory }) {
    const normalizedFactory = assertFunction(factory, "factory", {
        errorMessage: `GML plugin component ${description} factory must be a function.`
    });

    const bundle = Object.freeze(normalizedFactory());

    return Object.freeze({
        bundle,
        resolve() {
            return bundle;
        }
    });
}
