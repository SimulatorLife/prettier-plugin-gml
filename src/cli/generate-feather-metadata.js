import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

import { escapeRegExp } from "../shared/regexp.js";
import { CliUsageError, handleCliError } from "../shared/cli-errors.js";
import {
    MANUAL_CACHE_ROOT_ENV_VAR,
    resolveManualCacheRoot
} from "./options/manual-cache.js";
import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    resolveProgressBarWidth
} from "./options/progress-bar.js";
import {
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    buildManualRepositoryEndpoints,
    normalizeManualRepository
} from "./options/manual-repo.js";

const KB = 1024;
const MB = KB * 1024;

function assertSupportedNodeVersion() {
    const [major, minor] = process.versions.node
        .split(".")
        .map((part) => Number.parseInt(part, 10));
    if (Number.isNaN(major) || Number.isNaN(minor)) {
        throw new Error(
            `Unable to determine Node.js version from ${process.version}.`
        );
    }
    const MINIMUM_MINOR_VERSION_BY_MAJOR = { 18: 18, 20: 9 };
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CACHE_ROOT = resolveManualCacheRoot({ repoRoot: REPO_ROOT });
const OUTPUT_DEFAULT = path.join(
    REPO_ROOT,
    "resources",
    "feather-metadata.json"
);

const FEATHER_PAGES = {
    diagnostics:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Messages.htm",
    directives:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Directives.htm",
    naming: "Manual/contents/Setting_Up_And_Version_Information/IDE_Preferences/Feather_Settings.htm",
    typeSystem:
        "Manual/contents/The_Asset_Editors/Code_Editor_Properties/Feather_Data_Types.htm"
};

function getUsage({
    cacheRoot = DEFAULT_CACHE_ROOT,
    manualRepo = DEFAULT_MANUAL_REPO,
    progressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH
} = {}) {
    return [
        "Usage: node scripts/generate-feather-metadata.mjs [options]",
        "",
        "Options:",
        "  --ref, -r <git-ref>       Manual git ref (tag, branch, or commit). Defaults to latest tag.",
        "  --output, -o <path>       Output JSON path. Defaults to resources/feather-metadata.json.",
        "  --force-refresh           Ignore cached manual artefacts and re-download.",
        "  --quiet                   Suppress progress output (useful in CI).",
        `  --progress-bar-width <n>  Width of the terminal progress bar (default: ${progressBarWidth}).`,
        `  --manual-repo <owner/name> GitHub repository hosting the manual (default: ${manualRepo}).`,
        `                             Can also be set via ${MANUAL_REPO_ENV_VAR}.`,
        `  --cache-root <path>       Directory to store cached manual artefacts (default: ${cacheRoot}).`,
        `                             Can also be set via ${MANUAL_CACHE_ROOT_ENV_VAR}.`,
        "  --help, -h                Show this help message."
    ].join("\n");
}

function resolveManualRepoValue(rawValue, { usage, source = "cli" } = {}) {
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
            : "--manual-repo requires a GitHub repository in 'owner/name' format";
    throw new CliUsageError(`${requirement} (received ${received}).`, {
        usage
    });
}

function parseArgs({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    let ref = env.GML_MANUAL_REF ?? null;
    let outputPath = OUTPUT_DEFAULT;
    let forceRefresh = false;
    let progressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH;
    let cacheRoot = DEFAULT_CACHE_ROOT;
    let manualRepo = DEFAULT_MANUAL_REPO;

    const usage = () => getUsage({ cacheRoot, manualRepo, progressBarWidth });

    if (env.GML_PROGRESS_BAR_WIDTH !== undefined) {
        progressBarWidth = resolveProgressBarWidth(env.GML_PROGRESS_BAR_WIDTH, {
            usage: usage()
        });
    }
    if (env[MANUAL_REPO_ENV_VAR] !== undefined) {
        manualRepo = resolveManualRepoValue(env[MANUAL_REPO_ENV_VAR], {
            usage: usage(),
            source: "env"
        });
    }
    const verbose = {
        resolveRef: true,
        downloads: true,
        parsing: true,
        progressBar: isTty
    };

    const args = Array.from(argv);
    let showHelp = false;

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if ((arg === "--ref" || arg === "-r") && i + 1 < args.length) {
            ref = args[i + 1];
            i += 1;
        } else if (
            (arg === "--output" || arg === "-o") &&
            i + 1 < args.length
        ) {
            outputPath = path.resolve(args[i + 1]);
            i += 1;
        } else if (arg === "--force-refresh") {
            forceRefresh = true;
        } else if (arg === "--quiet") {
            verbose.resolveRef = false;
            verbose.downloads = false;
            verbose.parsing = false;
            verbose.progressBar = false;
        } else if (arg === "--progress-bar-width") {
            if (i + 1 >= args.length) {
                throw new CliUsageError(
                    "--progress-bar-width requires a numeric value.",
                    { usage: usage() }
                );
            }
            progressBarWidth = resolveProgressBarWidth(args[i + 1], {
                usage: usage()
            });
            i += 1;
        } else if (arg === "--manual-repo") {
            if (i + 1 >= args.length) {
                throw new CliUsageError(
                    "--manual-repo requires a repository value.",
                    { usage: usage() }
                );
            }
            manualRepo = resolveManualRepoValue(args[i + 1], {
                usage: usage()
            });
            i += 1;
        } else if (arg === "--cache-root") {
            if (i + 1 >= args.length) {
                throw new CliUsageError("--cache-root requires a path value.", {
                    usage: usage()
                });
            }
            cacheRoot = path.resolve(args[i + 1]);
            i += 1;
        } else if (arg === "--help" || arg === "-h") {
            showHelp = true;
            break;
        } else {
            throw new CliUsageError(`Unknown argument: ${arg}`, {
                usage: usage()
            });
        }
    }

    const usageText = usage();

    return {
        ref,
        outputPath,
        forceRefresh,
        verbose,
        progressBarWidth,
        cacheRoot,
        manualRepo,
        showHelp,
        usage: usageText
    };
}

const BASE_HEADERS = {
    "User-Agent": "prettier-plugin-gml feather metadata generator"
};

if (process.env.GITHUB_TOKEN) {
    BASE_HEADERS.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function curlRequest(url, { headers = {}, acceptJson = false } = {}) {
    const finalHeaders = { ...BASE_HEADERS, ...headers };
    if (acceptJson) {
        finalHeaders.Accept = "application/vnd.github+json";
    }
    const response = await fetch(url, {
        headers: finalHeaders,
        redirect: "follow"
    });

    const bodyText = await response.text();
    if (!response.ok) {
        const errorMessage = bodyText || response.statusText;
        throw new Error(`Request failed for ${url}: ${errorMessage}`);
    }

    return bodyText;
}

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function resolveManualRef(ref, { verbose, apiRoot }) {
    if (verbose.resolveRef) {
        console.log(
            ref
                ? `Resolving manual reference '${ref}'…`
                : "Resolving latest manual tag…"
        );
    }
    if (ref) {
        return resolveCommitFromRef(ref, { apiRoot });
    }

    const latestTagUrl = `${apiRoot}/tags?per_page=1`;
    const body = await curlRequest(latestTagUrl, { acceptJson: true });
    const tags = JSON.parse(body);
    if (!Array.isArray(tags) || tags.length === 0) {
        console.warn("No manual tags found; defaulting to 'develop' branch.");
        return resolveCommitFromRef("develop", { apiRoot });
    }
    const { name, commit } = tags[0];
    return {
        ref: name,
        sha: commit?.sha ?? null
    };
}

async function resolveCommitFromRef(ref, { apiRoot }) {
    const url = `${apiRoot}/commits/${encodeURIComponent(ref)}`;
    const body = await curlRequest(url, { acceptJson: true });
    const payload = JSON.parse(body);
    if (!payload?.sha) {
        throw new Error(`Could not determine commit SHA for ref '${ref}'.`);
    }
    return { ref, sha: payload.sha };
}

function formatDuration(startTime) {
    const deltaMs = Date.now() - startTime;
    if (deltaMs < 1000) {
        return `${deltaMs}ms`;
    }
    return `${(deltaMs / 1000).toFixed(1)}s`;
}

function formatBytes(text) {
    const size = Buffer.byteLength(text, "utf8");
    if (size >= MB) {
        return `${(size / MB).toFixed(1)}MB`;
    }
    if (size >= KB) {
        return `${(size / KB).toFixed(1)}KB`;
    }
    return `${size}B`;
}

async function fetchManualFile(
    sha,
    filePath,
    { forceRefresh = false, verbose, cacheRoot = DEFAULT_CACHE_ROOT, rawRoot }
) {
    const shouldLogDetails = verbose.downloads && !verbose.progressBar;
    const cachePath = path.join(cacheRoot, sha, filePath);
    if (!forceRefresh) {
        try {
            const cached = await fs.readFile(cachePath, "utf8");
            if (shouldLogDetails) {
                console.log(`[cache] ${filePath}`);
            }
            return cached;
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }

    const startTime = Date.now();
    if (shouldLogDetails) {
        console.log(`[download] ${filePath}…`);
    }
    const resolvedRawRoot = rawRoot ?? buildManualRepositoryEndpoints().rawRoot;
    const url = `${resolvedRawRoot}/${sha}/${filePath}`;
    const content = await curlRequest(url);
    await ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, content, "utf8");
    if (shouldLogDetails) {
        console.log(
            `[done] ${filePath} (${formatBytes(content)} in ${formatDuration(
                startTime
            )})`
        );
    }
    return content;
}

function renderProgressBar(
    label,
    current,
    total,
    width = DEFAULT_PROGRESS_BAR_WIDTH
) {
    if (!process.stdout.isTTY || width <= 0) {
        return;
    }
    const clampedTotal = total > 0 ? total : 1;
    const ratio = Math.min(Math.max(current / clampedTotal, 0), 1);
    const filled = Math.round(ratio * width);
    const bar = `${"#".repeat(filled)}${"-".repeat(Math.max(width - filled, 0))}`;
    const message = `${label} [${bar}] ${current}/${total}`;
    process.stdout.write(`\r${message}`);
    if (current >= total) {
        process.stdout.write("\n");
    }
}

function timeSync(label, fn, { verbose }) {
    if (verbose.parsing) {
        console.log(`→ ${label}`);
    }
    const startTime = Date.now();
    const result = fn();
    if (verbose.parsing) {
        console.log(`  ${label} completed in ${formatDuration(startTime)}.`);
    }
    return result;
}

function normaliseMultilineText(text) {
    if (!text) {
        return null;
    }
    const lines = text.split("\n").map((line) => line.trim());
    const cleaned = [];
    for (const line of lines) {
        if (!line) {
            if (cleaned.length && cleaned[cleaned.length - 1] !== "") {
                cleaned.push("");
            }
        } else {
            cleaned.push(line);
        }
    }
    return cleaned.join("\n").trim();
}

function extractTable($, $node) {
    const headers = [];
    const rows = [];
    $node.find("tr").each((rowIndex, row) => {
        const cells = $(row).children("th, td");
        const values = cells
            .map((_, cell) => {
                const $cell = $(cell);
                const lines = splitCellLines($cell);
                if (!lines.length) {
                    return null;
                }
                return lines.join("\n");
            })
            .get();
        const hasContent = values.some((value) => value && value.trim());
        if (!hasContent) {
            return;
        }
        if (rowIndex === 0 && $(row).find("th").length > 0) {
            headers.push(
                ...values
                    .map((value) => normaliseMultilineText(value))
                    .filter((value) => Boolean(value))
            );
            return;
        }
        rows.push(values.map((value) => normaliseMultilineText(value) ?? null));
    });
    return { headers, rows };
}

function createBlock($, node) {
    if (node.type !== "tag") {
        return null;
    }
    const $node = $(node);
    if ($node.hasClass("footer") || $node.hasClass("seealso")) {
        return null;
    }
    const tagName = node.name?.toLowerCase() ?? "";
    let type = "html";
    if (tagName === "p") {
        if ($node.hasClass("code")) {
            type = "code";
        } else if ($node.hasClass("note") || $node.hasClass("warning")) {
            type = "note";
        } else {
            type = "paragraph";
        }
    } else if (tagName === "h4" || tagName === "h5") {
        type = "heading";
    } else if (tagName === "ul" || tagName === "ol") {
        type = "list";
    } else if (tagName === "table") {
        type = "table";
    } else if (tagName === "div" && $node.hasClass("codeblock")) {
        type = "code";
    }

    const preserveLineBreaks = type === "code" || type === "list";
    const text = extractText($node, { preserveLineBreaks });

    if (!text && type !== "list") {
        return null;
    }

    const block = { type, text };
    if (tagName === "h4" || tagName === "h5") {
        block.level = Number(tagName.substring(1));
    }
    if (type === "list") {
        block.items = $node
            .children("li")
            .map((_, item) =>
                extractText($(item), { preserveLineBreaks: false })
            )
            .get()
            .filter(Boolean);
        if (!block.items.length && !text) {
            return null;
        }
    }
    if (type === "table") {
        block.table = extractTable($, $node);
    }
    return block;
}

function extractText($node, { preserveLineBreaks = false } = {}) {
    const clone = $node.clone();
    clone.find("br").replaceWith("\n");
    let text = clone.text().replace(/\u00a0/g, " ");
    if (preserveLineBreaks) {
        text = text
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n")
            .trim();
    } else {
        text = text.replace(/\s+/g, " ").trim();
    }
    return text;
}

function collectBlocksAfter($, element, { stopTags = [] } = {}) {
    const stopSet = new Set(stopTags.map((tag) => tag.toLowerCase()));
    const blocks = [];
    let node = element.nextSibling;
    while (node) {
        if (node.type === "tag") {
            const tagName = node.name?.toLowerCase() ?? "";
            if (stopSet.has(tagName)) {
                break;
            }
            const classAttr = node.attribs?.class ?? "";
            const classList = classAttr
                ? classAttr.split(/\s+/).filter(Boolean)
                : [];
            if (tagName === "div" && classList.includes("footer")) {
                break;
            }
            const block = createBlock($, node);
            if (block) {
                blocks.push(block);
            }
        }
        node = node.nextSibling;
    }
    return blocks;
}

function normaliseTextBlock(block) {
    if (!block) {
        return null;
    }
    if (
        block.type === "list" &&
        Array.isArray(block.items) &&
        block.items.length > 0
    ) {
        return block.items.join("\n").trim() || null;
    }
    return block.text?.trim() || null;
}

function normaliseContent(blocks) {
    const content = {
        paragraphs: [],
        notes: [],
        codeExamples: [],
        lists: [],
        headings: [],
        tables: []
    };
    for (const block of blocks) {
        if (!block) {
            continue;
        }
        if (block.type === "code") {
            if (block.text) {
                content.codeExamples.push(block.text);
            }
            continue;
        }
        if (block.type === "note") {
            const note = normaliseMultilineText(block.text ?? "");
            if (note) {
                content.notes.push(note);
            }
            continue;
        }
        if (block.type === "list") {
            const items = Array.isArray(block.items)
                ? block.items
                    .map((item) => normaliseMultilineText(item))
                    .filter(Boolean)
                : [];
            if (items.length) {
                content.lists.push(items);
            }
            continue;
        }
        if (block.type === "table") {
            if (block.table) {
                content.tables.push(block.table);
            }
            continue;
        }
        if (block.type === "heading") {
            const heading = normaliseMultilineText(block.text ?? "");
            if (heading) {
                content.headings.push(heading);
            }
            continue;
        }
        const paragraph = normaliseMultilineText(block.text ?? "");
        if (paragraph) {
            content.paragraphs.push(paragraph);
        }
    }
    return content;
}

function joinSections(parts) {
    return (
        parts
            .map((part) => part.trim())
            .filter(Boolean)
            .join("\n\n") || null
    );
}

function parseDiagnostics(html) {
    const $ = load(html);
    const diagnostics = [];
    $("h3").each((_, element) => {
        const headingText = $(element)
            .text()
            .replace(/\u00a0/g, " ")
            .trim();
        const match = headingText.match(/^(GM\d{3,})\s*-\s*(.+)$/);
        if (!match) {
            return;
        }
        const [, id, title] = match;
        const blocks = collectBlocksAfter($, element, {
            stopTags: ["h3", "h2"]
        });

        const exampleHeadingIndex = blocks.findIndex(
            (block) =>
                block.type === "heading" && /example/i.test(block.text ?? "")
        );
        const firstCodeIndex = blocks.findIndex(
            (block) => block.type === "code"
        );

        let trailingStart = blocks.length;
        if (exampleHeadingIndex >= 0) {
            trailingStart = exampleHeadingIndex + 1;
        } else if (firstCodeIndex >= 0) {
            trailingStart = firstCodeIndex;
        }

        const descriptionBlocks = blocks.slice(0, trailingStart);
        const trailingBlocks = blocks.slice(trailingStart);

        const descriptionParts = [];
        const correctionParts = [];
        let badExample = null;
        let goodExample = null;

        for (const block of descriptionBlocks) {
            if (block.type === "heading") {
                continue;
            }
            const text = normaliseTextBlock(block);
            if (text) {
                descriptionParts.push(text);
            }
        }

        for (const block of trailingBlocks) {
            if (block.type === "heading") {
                continue;
            }
            if (block.type === "code") {
                const codeText = normaliseTextBlock(block);
                if (!codeText) {
                    continue;
                }
                if (!badExample) {
                    badExample = codeText;
                } else if (!goodExample) {
                    goodExample = codeText;
                } else {
                    goodExample = `${goodExample}\n\n${codeText}`.trim();
                }
                continue;
            }
            const text = normaliseTextBlock(block);
            if (!text) {
                continue;
            }
            if (!badExample) {
                descriptionParts.push(text);
            } else {
                correctionParts.push(text);
            }
        }

        const description = joinSections(descriptionParts);
        const correction = joinSections(correctionParts);

        diagnostics.push({
            id,
            title: title.trim(),
            description,
            badExample,
            goodExample,
            correction
        });
    });
    return diagnostics;
}

function parseNamingRules(html) {
    const $ = load(html);
    const heading = $("h2#s4").first();
    if (heading.length === 0) {
        return {
            overview: null,
            notes: [],
            namingStyleOptions: [],
            supportsPrefix: false,
            supportsSuffix: false,
            supportsPreserveUnderscores: false,
            ruleSections: []
        };
    }

    const blocks = collectBlocksAfter($, heading.get(0), { stopTags: ["h2"] });
    const content = normaliseContent(blocks);
    const overview = joinSections(content.paragraphs);
    const notes = content.notes;
    const requiresMessage =
        (overview && overview.includes("GM2017")) ||
        notes.find((note) => note.includes("GM2017"))
            ? "GM2017"
            : null;

    const mainList = heading.nextAll("ul").first();
    let namingStyleOptions = [];
    let identifierBlocklist = null;
    let identifierRuleSummary = null;
    let supportsPrefix = false;
    let supportsSuffix = false;
    let supportsPreserveUnderscores = false;
    const ruleSections = [];

    if (mainList.length > 0) {
        mainList.find("li > strong").each((_, strongEl) => {
            const strongText = $(strongEl)
                .text()
                .replace(/\u00a0/g, " ")
                .trim();
            const listItem = $(strongEl).closest("li");
            if (strongText === "Naming Style") {
                const styles = listItem.find("ul li");
                namingStyleOptions = styles
                    .map((__, styleEl) =>
                        extractText($(styleEl), { preserveLineBreaks: false })
                    )
                    .get();
            } else if (strongText === "Identifier Blocklist") {
                identifierBlocklist = extractText(listItem, {
                    preserveLineBreaks: true
                });
            } else if (strongText.endsWith("Naming Rule")) {
                identifierRuleSummary = extractText(listItem, {
                    preserveLineBreaks: true
                });
            } else if (strongText === "Prefix") {
                supportsPrefix = true;
            } else if (strongText === "Suffix") {
                supportsSuffix = true;
            } else if (strongText.toLowerCase().includes("preserve")) {
                supportsPreserveUnderscores = true;
            }
        });

        mainList.children("li").each((_, item) => {
            const $item = $(item);
            const title =
                $item
                    .children("strong")
                    .first()
                    .text()
                    .replace(/\u00a0/g, " ")
                    .trim() || null;
            const description = extractText($item, {
                preserveLineBreaks: true
            });
            let normalisedDescription = normaliseMultilineText(
                description ?? ""
            );
            if (title && normalisedDescription) {
                const prefixPattern = new RegExp(
                    `^${escapeRegExp(title)}\s*:?\s*`,
                    "i"
                );
                normalisedDescription = normalisedDescription.replace(
                    prefixPattern,
                    ""
                );
                normalisedDescription = normalisedDescription.trim();
            }
            const nestedList = $item.find("ul").first();
            let options = [];
            if (nestedList.length) {
                options = nestedList
                    .children("li")
                    .map((__, option) =>
                        normaliseMultilineText(
                            extractText($(option), {
                                preserveLineBreaks: false
                            })
                        )
                    )
                    .get()
                    .filter(Boolean);
            }
            ruleSections.push({
                title: title || null,
                description: normalisedDescription || null,
                options
            });
        });
    }

    return {
        overview,
        notes,
        requiresMessage,
        identifierBlocklist: normaliseMultilineText(identifierBlocklist),
        identifierRuleSummary: normaliseMultilineText(identifierRuleSummary),
        namingStyleOptions: namingStyleOptions
            .map((option) => normaliseMultilineText(option))
            .filter(Boolean),
        supportsPrefix,
        supportsSuffix,
        supportsPreserveUnderscores,
        ruleSections
    };
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

function parseDirectiveSections(html) {
    const $ = load(html);
    const sections = [];
    $("h2").each((_, element) => {
        const title = $(element)
            .text()
            .replace(/\u00a0/g, " ")
            .trim();
        if (!title) {
            return;
        }
        const blocks = collectBlocksAfter($, element, { stopTags: ["h2"] });
        const id = $(element).attr("id") || slugify(title);
        const content = normaliseContent(blocks);
        sections.push({
            id,
            title,
            description: joinSections(content.paragraphs) || null,
            notes: content.notes,
            codeExamples: content.codeExamples,
            lists: content.lists,
            subheadings: content.headings,
            tables: content.tables
        });
    });
    return sections;
}

function splitCellLines($cell) {
    const clone = $cell.clone();
    clone.find("br").replaceWith("\n");
    return clone
        .text()
        .replace(/\u00a0/g, " ")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function parseBaseTypeTable($, table) {
    const baseTypes = [];
    const rows = $(table).find("tbody > tr");
    rows.each((index, row) => {
        if (index === 0) {
            return;
        }
        const cells = $(row).find("th, td");
        if (cells.length < 3) {
            return;
        }
        const name = extractText(cells.eq(0), { preserveLineBreaks: false });
        const specifierExamples = splitCellLines(cells.eq(1));
        const description = extractText(cells.eq(2), {
            preserveLineBreaks: false
        });
        baseTypes.push({ name, specifierExamples, description });
    });
    return baseTypes;
}

function parseTypeValidationTable($, table) {
    if (!table || table.length === 0) {
        return null;
    }
    const headerCells = table.find("tr").first().find("th, td");
    const columns = headerCells
        .map((index, cell) => {
            if (index === 0) {
                return null;
            }
            return extractText($(cell), { preserveLineBreaks: false });
        })
        .get()
        .filter(Boolean);

    const rows = [];
    table
        .find("tr")
        .slice(1)
        .each((_, row) => {
            const cells = $(row).find("th, td");
            if (cells.length === 0) {
                return;
            }
            const from = extractText(cells.eq(0), {
                preserveLineBreaks: false
            });
            if (!from) {
                return;
            }
            const results = {};
            columns.forEach((column, columnIndex) => {
                const cell = cells.eq(columnIndex + 1);
                const outcome =
                    extractText(cell, { preserveLineBreaks: false }) || null;
                const style = cell.attr("style") || null;
                results[column] = {
                    outcome,
                    style: style?.replace(/\s+/g, " ").trim() || null
                };
            });
            rows.push({ from, results });
        });

    return { columns, rows };
}

function parseTypeSystem(html) {
    const $ = load(html);
    const introBlocks = [];
    const articleBody = $("h1").first();
    if (articleBody.length > 0) {
        let node = articleBody.get(0).nextSibling;
        while (node) {
            if (node.type === "tag" && node.name?.toLowerCase() === "table") {
                break;
            }
            if (node.type === "tag") {
                const block = createBlock($, node);
                if (block) {
                    introBlocks.push(block);
                }
            }
            node = node.nextSibling;
        }
    }
    const introContent = normaliseContent(introBlocks);

    const tables = $("table");
    const baseTypeTable = tables.eq(0);
    const baseTypes = baseTypeTable.length
        ? parseBaseTypeTable($, baseTypeTable)
        : [];

    const noteBlocks = $("p.note")
        .map((_, element) => createBlock($, element))
        .get()
        .filter(Boolean);
    const notes = noteBlocks
        .map((block) => normaliseMultilineText(block.text ?? ""))
        .filter(Boolean);

    const specifierSections = [];
    $("h3").each((_, element) => {
        const title = $(element)
            .text()
            .replace(/\u00a0/g, " ")
            .trim();
        if (!title) {
            return;
        }
        const blocks = collectBlocksAfter($, element, {
            stopTags: ["h3", "h2"]
        });
        const content = normaliseContent(blocks);
        specifierSections.push({
            id: $(element).attr("id") || slugify(title),
            title,
            description: joinSections(content.paragraphs) || null,
            notes: content.notes,
            codeExamples: content.codeExamples,
            lists: content.lists
        });
    });

    const typeValidationHeading = $("h2")
        .filter((_, element) => $(element).text().includes("Type Validation"))
        .first();
    let typeValidation = null;
    let typeValidationBlocks = [];
    if (typeValidationHeading.length > 0) {
        typeValidationBlocks = collectBlocksAfter(
            $,
            typeValidationHeading.get(0),
            {
                stopTags: ["table", "h2"]
            }
        );
        const validationTable = typeValidationHeading.nextAll("table").first();
        typeValidation = parseTypeValidationTable($, validationTable);
    }

    const typeValidationContent = normaliseContent(typeValidationBlocks);

    return {
        overview: joinSections(introContent.paragraphs) || null,
        overviewNotes: introContent.notes,
        baseTypes: baseTypes.map((type) => ({
            name: type.name,
            specifierExamples: type.specifierExamples
                .map((example) => normaliseMultilineText(example))
                .filter(Boolean),
            description: normaliseMultilineText(type.description)
        })),
        notes,
        specifierSections,
        typeValidation: typeValidation
            ? {
                description:
                      joinSections(typeValidationContent.paragraphs) || null,
                notes: typeValidationContent.notes,
                codeExamples: typeValidationContent.codeExamples,
                lists: typeValidationContent.lists,
                table: typeValidation
            }
            : null
    };
}

async function main({ argv, env, isTty } = {}) {
    assertSupportedNodeVersion();

    const {
        ref,
        outputPath,
        forceRefresh,
        verbose,
        progressBarWidth,
        cacheRoot,
        manualRepo,
        showHelp,
        usage
    } = parseArgs({ argv, env, isTty });

    if (showHelp) {
        console.log(usage);
        return 0;
    }
    const { apiRoot, rawRoot } = buildManualRepositoryEndpoints(manualRepo);
    const startTime = Date.now();
    const manualRef = await resolveManualRef(ref, { verbose, apiRoot });
    if (!manualRef?.sha) {
        throw new Error("Could not resolve manual commit SHA.");
    }
    console.log(`Using manual ref '${manualRef.ref}' (${manualRef.sha}).`);

    const htmlPayloads = {};
    const manualEntries = Object.entries(FEATHER_PAGES);
    const totalManualPages = manualEntries.length;
    if (verbose.downloads) {
        console.log(
            `Fetching ${totalManualPages} manual page${
                totalManualPages === 1 ? "" : "s"
            }…`
        );
    }

    let fetchedCount = 0;
    for (const [key, manualPath] of manualEntries) {
        htmlPayloads[key] = await fetchManualFile(manualRef.sha, manualPath, {
            forceRefresh,
            verbose,
            cacheRoot,
            rawRoot
        });
        fetchedCount += 1;
        if (verbose.progressBar && verbose.downloads) {
            renderProgressBar(
                "Downloading manual pages",
                fetchedCount,
                totalManualPages,
                progressBarWidth
            );
        } else if (verbose.downloads) {
            console.log(`✓ ${manualPath}`);
        }
    }
    if (verbose.parsing) {
        console.log("Parsing manual sections…");
    }
    const diagnostics = timeSync(
        "Diagnostics",
        () => parseDiagnostics(htmlPayloads.diagnostics),
        { verbose }
    );
    const directives = timeSync(
        "Directives",
        () => parseDirectiveSections(htmlPayloads.directives),
        { verbose }
    );
    const namingRules = timeSync(
        "Naming rules",
        () => parseNamingRules(htmlPayloads.naming),
        { verbose }
    );
    const typeSystem = timeSync(
        "Type system",
        () => parseTypeSystem(htmlPayloads.typeSystem),
        { verbose }
    );

    const payload = {
        meta: {
            manualRef: manualRef.ref,
            commitSha: manualRef.sha,
            generatedAt: new Date().toISOString(),
            source: manualRepo,
            manualPaths: { ...FEATHER_PAGES }
        },
        diagnostics,
        directives,
        namingRules,
        typeSystem
    };

    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(
        outputPath,
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8"
    );

    console.log(`Wrote Feather metadata to ${outputPath}`);
    if (verbose.parsing) {
        console.log(`Completed in ${formatDuration(startTime)}.`);
    }
    return 0;
}

export async function runGenerateFeatherMetadataCli({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    try {
        return await main({ argv, env, isTty });
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to generate Feather metadata."
        });
        return 1;
    }
}
