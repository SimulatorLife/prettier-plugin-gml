const IdentifierRole = Object.freeze({
    DECLARATION: "declaration",
    REFERENCE: "reference"
});

const VALID_IDENTIFIER_ROLES = new Set(Object.values(IdentifierRole));

function formatRoleForMessage(role) {
    if (typeof role === "string") {
        return JSON.stringify(role);
    }

    if (role === null) {
        return "null";
    }

    return typeof role;
}

export function assertValidIdentifierRole(role, context = "identifier role") {
    if (!VALID_IDENTIFIER_ROLES.has(role)) {
        throw new TypeError(
            `Invalid ${context}: ${formatRoleForMessage(role)}. ` +
                `Expected one of: ${[...VALID_IDENTIFIER_ROLES]
                    .map((value) => JSON.stringify(value))
                    .join(", ")}`
        );
    }

    return role;
}

export { IdentifierRole };
