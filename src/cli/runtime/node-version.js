const MINIMUM_MINOR_VERSION_BY_MAJOR = { 18: 18, 20: 9 };

export function assertSupportedNodeVersion() {
    const [major, minor] = process.versions.node
        .split(".")
        .map((part) => Number.parseInt(part, 10));

    if (Number.isNaN(major) || Number.isNaN(minor)) {
        throw new Error(
            `Unable to determine Node.js version from ${process.version}.`
        );
    }

    if (major < 18) {
        throw new Error(
            `Node.js 18.18.0 or newer is required. Detected ${process.version}.`
        );
    }

    if (major === 18 && minor < MINIMUM_MINOR_VERSION_BY_MAJOR[18]) {
        throw new Error(
            `Node.js 18.18.0 or newer is required. Detected ${process.version}.`
        );
    }

    if (major === 20 && minor < MINIMUM_MINOR_VERSION_BY_MAJOR[20]) {
        throw new Error(
            `Node.js 20.9.0 or newer is required. Detected ${process.version}.`
        );
    }
}
