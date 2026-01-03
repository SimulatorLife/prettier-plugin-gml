type ReadOnlyViewSelector<T extends object> = () => T;

/**
 * Create a read-only proxy view over the resolved object returned by `selector`.
 * The proxy lazily evaluates `selector` to defer initialization while preventing
 * any mutations to the resolved value (delete, defineProperty, set).
 */
export function createReadOnlyView<T extends object>(
    selector: ReadOnlyViewSelector<T>,
    description = "read-only view"
): Readonly<T> {
    const getSource = (): T => {
        const source = selector();

        if (source && typeof source === "object") {
            return source;
        }

        throw new TypeError(`${description} must resolve to an object.`);
    };

    const target = Object.create(null) as T;

    return new Proxy(target, {
        get(_target, property, receiver) {
            if (property === Symbol.toStringTag) {
                return "Object";
            }

            return Reflect.get(getSource(), property, receiver);
        },
        has(_target, property) {
            return Reflect.has(getSource(), property);
        },
        ownKeys() {
            return Reflect.ownKeys(getSource());
        },
        getOwnPropertyDescriptor(_target, property) {
            const descriptor = Reflect.getOwnPropertyDescriptor(getSource(), property);

            if (descriptor) {
                return {
                    configurable: true,
                    enumerable: descriptor.enumerable ?? true,
                    value: descriptor.value,
                    writable: false
                };
            }
        },
        getPrototypeOf() {
            return Object.prototype;
        },
        set() {
            throw new TypeError(`${description} cannot be modified once resolved.`);
        },
        defineProperty() {
            throw new TypeError(`${description} cannot be modified once resolved.`);
        },
        deleteProperty() {
            throw new TypeError(`${description} cannot be modified once resolved.`);
        }
    }) as Readonly<T>;
}
