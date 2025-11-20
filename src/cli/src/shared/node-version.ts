const VERSION_REQUIREMENTS = new Map<number, { minor: number; label: string }>([
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

interface NodeEnvironment {
    version?: string;
    versions?: {
        node?: string;
    };
}

function parseVersionPart(part: string): number {
    return Number.parseInt(part, 10);
}

function buildUnsupportedVersionError(label?: string): Error {
    const requiredLabel = label ?? LOWEST_SUPPORTED_REQUIREMENT.label;
    return new Error(
        `Node.js ${requiredLabel} or newer is required. Detected ${process.version}.`
    );
}

function normalizeVersionString(rawVersion: string): string {
    if (typeof rawVersion !== "string") {
        return "";
    }

    return rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
}

/**
 * Extracts the major and minor portion of the current Node.js runtime version.
 *
 * The runtime only interacts with an explicit version string, which keeps
 * callers from depending on the nested `process.versions` object.
 *
 */
function readNodeVersionParts(
    environment: NodeEnvironment = process
): { majorPart: string; minorPart: string } {
    const { version, versions } = environment;
    const normalized = normalizeVersionString(
        typeof version === "string" ? version : (versions?.node ?? "")
    );

    const [majorPart = "", minorPart = "0"] = normalized.split(".");
    return { majorPart, minorPart };
}

export function assertSupportedNodeVersion(): void {
    const { majorPart, minorPart } = readNodeVersionParts();
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
