const VERSION_REQUIREMENTS = new Map([
    [18, { minor: 18, label: "18.18.0" }],
    [20, { minor: 9, label: "20.9.0" }]
]);

const LOWEST_SUPPORTED_MAJOR = Math.min(...VERSION_REQUIREMENTS.keys());
const LOWEST_SUPPORTED_REQUIREMENT = VERSION_REQUIREMENTS.get(
    LOWEST_SUPPORTED_MAJOR
) ?? {
    minor: 0,
    label: `${LOWEST_SUPPORTED_MAJOR}.0.0`
};

function parseVersionPart(part) {
    return Number.parseInt(part, 10);
}

function buildUnsupportedVersionError(label) {
    const requiredLabel = label ?? LOWEST_SUPPORTED_REQUIREMENT.label;
    return new Error(
        `Node.js ${requiredLabel} or newer is required. Detected ${process.version}.`
    );
}

export function assertSupportedNodeVersion() {
    const [majorPart, minorPart = "0"] = process.versions.node.split(".");
    const major = parseVersionPart(majorPart);
    const minor = parseVersionPart(minorPart);

    if (Number.isNaN(major) || Number.isNaN(minor)) {
        throw new TypeError(
            `Unable to determine Node.js version from ${process.version}.`
        );
    }

    if (major < LOWEST_SUPPORTED_MAJOR) {
        throw buildUnsupportedVersionError(LOWEST_SUPPORTED_REQUIREMENT.label);
    }

    const requirement = VERSION_REQUIREMENTS.get(major);
    if (requirement && minor < requirement.minor) {
        throw buildUnsupportedVersionError(requirement.label);
    }
}
