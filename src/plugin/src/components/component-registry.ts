import * as Core from "@gml-modules/core";

type RegistryOptions<T> = {
    description: string;
    factory: () => T;
};

export function createSingletonComponentRegistry<T>({
    description,
    factory
}: RegistryOptions<T>) {
    const normalizedFactory = Core.assertFunction(factory, "factory", {
        errorMessage: `GML plugin component ${description} factory must be a function.`
    }) as () => T;

    const bundle = Object.freeze(normalizedFactory());

    return Object.freeze({
        bundle,
        resolve(): T {
            return bundle;
        }
    });
}
