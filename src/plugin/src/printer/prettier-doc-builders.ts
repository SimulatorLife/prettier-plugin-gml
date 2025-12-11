import { doc, type Doc } from "prettier";

const { builders, utils } = doc;
const rawJoin = builders.join;
const { willBreak } = utils;
const { breakParent, line, hardline, softline, lineSuffixBoundary } = builders;

/**
 * Normalized child shape accepted by the Prettier doc builder helpers.
 *
 * The printer frequently assembles docs from heterogeneous values that may
 * include falsy placeholders. This type models the permissive inputs that can
 * be sanitized into valid Prettier {@link Doc} nodes.
 */
export type DocChild = Doc | DocChild[] | boolean | null | undefined;

function sanitizeDocChild(child: DocChild): Doc {
    if (Array.isArray(child)) {
        return child.map(sanitizeDocChild);
    }

    if (child === null || child === undefined || child === false) {
        return "";
    }

    if (child === true) {
        return "true";
    }

    return child;
}

/**
 * Concatenate doc fragments while gracefully discarding unsupported falsy
 * values.
 */
export function concat(parts: DocChild | DocChild[]): Doc {
    if (!Array.isArray(parts)) {
        return [sanitizeDocChild(parts)];
    }

    return parts.map((part) => sanitizeDocChild(part));
}

/**
 * Join doc fragments with a separator, ensuring every element is a valid doc
 * node.
 */
export function join(separator: Doc, parts: DocChild | DocChild[]): Doc {
    if (!Array.isArray(parts)) {
        const sanitized = sanitizeDocChild(parts);
        return rawJoin(separator, [sanitized]);
    }

    const sanitizedParts = parts.map((part) => sanitizeDocChild(part));
    return rawJoin(separator, sanitizedParts);
}

/**
 * Wrap a doc fragment in a Prettier group after sanitizing its children.
 */
export function group(parts: DocChild, opts?: Record<string, unknown>): Doc {
    const sanitized = sanitizeDocChild(parts);
    return builders.group(sanitized, opts);
}

/**
 * Construct a conditional group while sanitizing each branch.
 */
export function conditionalGroup(
    parts: DocChild[],
    opts?: Record<string, unknown>
): Doc {
    return builders.conditionalGroup(
        parts.map((part) => sanitizeDocChild(part)),
        opts
    );
}

/**
 * Increase indentation for the provided doc fragment after sanitization.
 */
export function indent(parts: DocChild): Doc {
    return builders.indent(sanitizeDocChild(parts));
}

/**
 * Render alternate docs depending on whether a line break occurs.
 */
export function ifBreak(
    breakContents: DocChild,
    flatContents?: DocChild,
    opts?: Record<string, unknown>
): Doc {
    return builders.ifBreak(
        sanitizeDocChild(breakContents),
        sanitizeDocChild(flatContents ?? ""),
        opts
    );
}

/**
 * Attach a sanitized doc fragment to the current line suffix.
 */
export function lineSuffix(parts: DocChild): Doc {
    return builders.lineSuffix(sanitizeDocChild(parts));
}

export { breakParent, line, hardline, softline, lineSuffixBoundary, willBreak };
