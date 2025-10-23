import { toTrimmedString } from "../shared-deps.js";

export const MANUAL_REPO_ENV_VAR = "GML_MANUAL_REPO";
export const DEFAULT_MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

export const MANUAL_REPO_REQUIREMENT_SOURCE = Object.freeze({
    CLI: "cli",
    ENV: "env"
});

const MANUAL_REPO_REQUIREMENT_MESSAGES = Object.freeze({
    [MANUAL_REPO_REQUIREMENT_SOURCE.ENV]: `${MANUAL_REPO_ENV_VAR} must specify a GitHub repository in 'owner/name' format`,
    [MANUAL_REPO_REQUIREMENT_SOURCE.CLI]:
        "Manual repository must be provided in 'owner/name' format"
});

const MANUAL_REPO_REQUIREMENT_SOURCE_VALUES = Object.freeze(
    Object.values(MANUAL_REPO_REQUIREMENT_SOURCE)
);

function formatManualRepoRequirement(
    source = MANUAL_REPO_REQUIREMENT_SOURCE.CLI
) {
    const message = MANUAL_REPO_REQUIREMENT_MESSAGES[source];
    if (message !== undefined) {
        return message;
    }

    const allowedValues = MANUAL_REPO_REQUIREMENT_SOURCE_VALUES.join(", ");
    const received = source === undefined ? "undefined" : `'${String(source)}'`;

    throw new TypeError(
        `Manual repository requirement source must be one of: ${allowedValues}. Received ${received}.`
    );
}

function describeManualRepoInput(value) {
    if (value == null) {
        return String(value);
    }

    return `'${String(value)}'`;
}

export function normalizeManualRepository(value) {
    const trimmed = toTrimmedString(value);
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

export function buildManualRepositoryEndpoints(
    manualRepo = DEFAULT_MANUAL_REPO
) {
    const isDefaultCandidate =
        manualRepo === undefined || manualRepo === null || manualRepo === "";

    const repoToUse = isDefaultCandidate
        ? DEFAULT_MANUAL_REPO
        : toTrimmedString(manualRepo);

    const normalized = normalizeManualRepository(repoToUse);
    if (!normalized) {
        const received = isDefaultCandidate ? DEFAULT_MANUAL_REPO : manualRepo;
        throw new Error(`Invalid manual repository provided: ${received}`);
    }

    return {
        manualRepo: normalized,
        apiRoot: `https://api.github.com/repos/${normalized}`,
        rawRoot: `https://raw.githubusercontent.com/${normalized}`
    };
}

export function resolveManualRepoValue(
    rawValue,
    { source = MANUAL_REPO_REQUIREMENT_SOURCE.CLI } = {}
) {
    const requirement = formatManualRepoRequirement(source);
    const normalized = normalizeManualRepository(rawValue);
    if (normalized) {
        return normalized;
    }

    const received = describeManualRepoInput(rawValue);

    throw new TypeError(`${requirement} (received ${received}).`);
}
