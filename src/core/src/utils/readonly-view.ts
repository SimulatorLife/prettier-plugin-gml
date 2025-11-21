type ReadOnlyViewSelector<T extends object> = () => T;

function createReadOnlyError(description: string) {
    return new TypeError(`${description} cannot be modified once resolved.`);
}

function ensureSource<T extends object>(
    selector: ReadOnlyViewSelector<T>,
    description: string
): T {
    const source = selector();

    if (source && typeof source === "object") {
        return source;
    }

    throw new TypeError(`${description} must resolve to an object.`);
}

function withSource<T extends object, TReturn>(
    selector: ReadOnlyViewSelector<T>,
    description: string,
    callback: (source: T) => TReturn
): TReturn {
    const source = ensureSource(selector, description);
    return callback(source);
}

/**
 * Create a read-only proxy view over the resolved object returned by `selector`.
 * The proxy lazily evaluates `selector` to defer initialization while preventing
 * any mutations to the resolved value (delete, defineProperty, set).
 */
export function createReadOnlyView<T extends object>(
    selector: ReadOnlyViewSelector<T>,
    description: string
): Readonly<T> {
    const descriptionText = description || "read-only view";
    const readOnlyError = createReadOnlyError(descriptionText);

    const throwReadOnlyError = (): never => {
        throw readOnlyError;
    };

    const target = Object.create(null) as T;

    return new Proxy(target, {
        get(_target, property, receiver) {
            if (property === Symbol.toStringTag) {
                return "Object";
            }

            return withSource(selector, descriptionText, (source) =>
                Reflect.get(source, property, receiver)
            );
        },
        has(_target, property) {
            return withSource(selector, descriptionText, (source) =>
                Reflect.has(source, property)
            );
        },
        ownKeys() {
            return withSource(selector, descriptionText, (source) =>
                Reflect.ownKeys(source)
            );
        },
        getOwnPropertyDescriptor(_target, property) {
            return withSource(selector, descriptionText, (source) => {
                const descriptor = Reflect.getOwnPropertyDescriptor(
                    source,
                    property
                );

                if (!descriptor) {
                    return undefined;
                }

                return {
                    configurable: true,
                    enumerable: descriptor.enumerable ?? true,
                    value: descriptor.value,
                    writable: false
                };
            });
        },
        getPrototypeOf() {
            return Object.prototype;
        },
        set() {
            throwReadOnlyError();
        },
        defineProperty() {
            throwReadOnlyError();
        },
        deleteProperty() {
            throwReadOnlyError();
        }
    }) as Readonly<T>;
}
