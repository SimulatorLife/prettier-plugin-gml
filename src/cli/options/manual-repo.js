const MANUAL_REPO_ENV_VAR = "GML_MANUAL_REPO";
const DEFAULT_MANUAL_REPO = "YoYoGames/GameMaker-Manual";

const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

function normalizeManualRepository(value) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }

    const segments = trimmed.split("/");
    if (segments.length !== 2) {
        return null;
    }

    const [owner, repo] = segments;
    if (!REPO_SEGMENT_PATTERN.test(owner) || !REPO_SEGMENT_PATTERN.test(repo)) {
        return null;
    }

    return `${owner}/${repo}`;
}

function buildManualRepositoryEndpoints(manualRepo = DEFAULT_MANUAL_REPO) {
    const repoToUse =
        manualRepo === undefined || manualRepo === null || manualRepo === ""
            ? DEFAULT_MANUAL_REPO
            : manualRepo;

    const normalized = normalizeManualRepository(repoToUse);
    if (!normalized) {
        throw new Error(`Invalid manual repository provided: ${repoToUse}`);
    }

    return {
        manualRepo: normalized,
        apiRoot: `https://api.github.com/repos/${normalized}`,
        rawRoot: `https://raw.githubusercontent.com/${normalized}`
    };
}

function resolveManualRepoValue(rawValue, { source = "cli" } = {}) {
    const normalized = normalizeManualRepository(rawValue);
    if (normalized) {
        return normalized;
    }

    let received;
    if (rawValue === undefined) {
        received = "undefined";
    } else if (rawValue === null) {
        received = "null";
    } else {
        received = `'${rawValue}'`;
    }

    const requirement =
        source === "env"
            ? `${MANUAL_REPO_ENV_VAR} must specify a GitHub repository in 'owner/name' format`
            : "Manual repository must be provided in 'owner/name' format";

    throw new TypeError(`${requirement} (received ${received}).`);
}

export {
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    buildManualRepositoryEndpoints,
    normalizeManualRepository,
    resolveManualRepoValue
};
