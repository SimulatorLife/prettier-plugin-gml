const objectPrototypeToString = Object.prototype.toString;

const OBJECT_TAG_PATTERN = /^\[object (\w+)\]$/u;

function getArticle(label) {
    return /^[AEIOU]/i.test(label) ? "an" : "a";
}

function defaultTypeDescription(value, { type }) {
    const article = getArticle(type);
    return `${article} ${type}`;
}

function defaultObjectDescription(value) {
    const tag = objectPrototypeToString.call(value);
    const match = OBJECT_TAG_PATTERN.exec(tag);

    if (match && match[1] !== "Object") {
        const label = match[1];
        const article = getArticle(label);
        return `${article} ${label} object`;
    }

    return "an object";
}

function resolveDescription(handler, value, context) {
    if (typeof handler === "function") {
        return handler(value, context);
    }

    return handler;
}

const DEFAULT_DESCRIPTION_HANDLERS = Object.freeze({
    nullDescription: "null",
    undefinedDescription: "undefined",
    arrayDescription: "an array",
    stringDescription: defaultTypeDescription,
    numberDescription: defaultTypeDescription,
    bigintDescription: defaultTypeDescription,
    booleanDescription: defaultTypeDescription,
    functionDescription: defaultTypeDescription,
    symbolDescription: defaultTypeDescription,
    objectDescription: defaultObjectDescription,
    fallbackDescription: defaultTypeDescription
});

function resolveValueKind(value) {
    if (value === null) {
        return "null";
    }

    if (value === undefined) {
        return "undefined";
    }

    if (Array.isArray(value)) {
        return "array";
    }

    return typeof value;
}

function normalizeDescriptionOptions(options = {}) {
    return {
        ...DEFAULT_DESCRIPTION_HANDLERS,
        ...options
    };
}

function selectDescriptionHandler(type, descriptions) {
    if (type === "null") {
        return descriptions.nullDescription;
    }

    if (type === "undefined") {
        return descriptions.undefinedDescription;
    }

    if (type === "array") {
        return descriptions.arrayDescription;
    }

    const primitives = {
        string: descriptions.stringDescription,
        number: descriptions.numberDescription,
        bigint: descriptions.bigintDescription,
        boolean: descriptions.booleanDescription,
        function: descriptions.functionDescription,
        symbol: descriptions.symbolDescription,
        object: descriptions.objectDescription
    };

    if (Object.prototype.hasOwnProperty.call(primitives, type)) {
        return primitives[type];
    }

    return descriptions.fallbackDescription;
}

/**
 * Generate human-readable descriptions for runtime values when formatting
 * validation errors. The helper centralizes the recurring pattern of
 * converting arbitrary inputs into phrases such as "a string" or
 * "an array" so call sites can focus on their domain-specific messaging.
 *
 * Callers may override type-specific descriptions by providing either a
 * string or callback. When a callback is supplied it receives the original
 * value along with a context object containing the detected type. Fallbacks
 * are only used when no matching handler is provided.
 *
 * @param {unknown} value Runtime value to describe.
 * @param {object} [options]
 * @param {string | ((value: unknown) => string)} [options.nullDescription="null"]
 *        Description used when {@link value} is `null`.
 * @param {string | ((value: unknown) => string)}
 *        [options.undefinedDescription="undefined"] Description used when
 *        {@link value} is `undefined`.
 * @param {string | ((value: unknown) => string)}
 *        [options.arrayDescription="an array"] Description used when
 *        {@link value} is an array.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.stringDescription] Description used for string values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.numberDescription] Description used for number values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.bigintDescription] Description used for bigint values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.booleanDescription] Description used for boolean values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.functionDescription] Description used for function values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.symbolDescription] Description used for symbol values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.objectDescription] Description used for non-null object
 *        values.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.fallbackDescription] Description used when the detected type
 *        does not match one of the explicit handlers.
 * @returns {string} Human-readable description for {@link value}.
 */
export function describeValueForMessage(value, options = {}) {
    const descriptions = normalizeDescriptionOptions(options);
    const type = resolveValueKind(value);
    const handler = selectDescriptionHandler(type, descriptions);

    return resolveDescription(handler, value, { type });
}

const DEFAULT_QUOTED_DESCRIPTION = (input, context = {}) => {
    try {
        return `'${String(input)}'`;
    } catch {
        const type = context.type ?? typeof input;
        return `'${type}'`;
    }
};

/**
 * Describe values while wrapping most runtime inputs in single quotes. The
 * helper builds on {@link describeValueForMessage} so callers can emit
 * consistent "Received" fragments when validating enumerated options or other
 * user-provided values. Type-specific descriptions may be overridden and the
 * quoting strategy is configurable to accommodate bespoke formatting.
 *
 * @param {unknown} value Runtime value to describe.
 * @param {object} [options]
 * @param {(value: unknown, context: { type: string }) => string} [options.quote]
 *        Custom quoting function applied to most value kinds.
 * @param {string} [options.undefinedDescription="undefined"]
 *        Description used when {@link value} is `undefined`.
 * @param {string} [options.nullDescription="'null'"] Description used when
 *        {@link value} is `null`.
 * @param {string | ((value: unknown, context: { type: string }) => string)}
 *        [options.fallbackDescription] Description used for unhandled types.
 * @param {Partial<ReturnType<typeof normalizeDescriptionOptions>>} [options.overrides]
 *        Optional overrides for the generated description handlers.
 * @returns {string} Human-readable, quoted description for {@link value}.
 */
export function describeValueWithQuotes(
    value,
    {
        quote,
        undefinedDescription = "undefined",
        nullDescription = "'null'",
        fallbackDescription,
        overrides = {}
    } = {}
) {
    const quoteValue =
        typeof quote === "function" ? quote : DEFAULT_QUOTED_DESCRIPTION;

    const baseHandlers = {
        undefinedDescription,
        nullDescription,
        arrayDescription: quoteValue,
        stringDescription: quoteValue,
        numberDescription: quoteValue,
        bigintDescription: quoteValue,
        booleanDescription: quoteValue,
        functionDescription: quoteValue,
        symbolDescription: quoteValue,
        objectDescription: quoteValue,
        fallbackDescription:
            fallbackDescription ??
            ((input, context) => quoteValue(input, context))
    };

    return describeValueForMessage(value, {
        ...baseHandlers,
        ...overrides
    });
}
