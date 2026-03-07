/**
 * Canonical role values for GML identifiers tracked during project analysis.
 */
const IdentifierRole = Object.freeze({
    DECLARATION: "declaration",
    REFERENCE: "reference"
} as const);

/** Union of all valid identifier role strings. */
export type IdentifierRoleValue = (typeof IdentifierRole)[keyof typeof IdentifierRole];

const VALID_IDENTIFIER_ROLES = new Set<string>(Object.values(IdentifierRole));

function formatRoleForMessage(role: unknown): string {
    if (typeof role === "string") {
        return JSON.stringify(role);
    }

    if (role === null) {
        return "null";
    }

    return typeof role;
}

/**
 * Asserts that `role` is a valid {@link IdentifierRoleValue}.
 * Throws a `TypeError` with a descriptive message when the value is invalid.
 */
export function assertValidIdentifierRole(role: unknown, context = "identifier role"): IdentifierRoleValue {
    if (!VALID_IDENTIFIER_ROLES.has(role as string)) {
        throw new TypeError(
            `Invalid ${context}: ${formatRoleForMessage(role)}. ` +
                `Expected one of: ${[...VALID_IDENTIFIER_ROLES].map((value) => JSON.stringify(value)).join(", ")}`
        );
    }

    return role as IdentifierRoleValue;
}

export { IdentifierRole };
