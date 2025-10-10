#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const API_ROOT = `https://api.github.com/repos/${MANUAL_REPO}`;
const RAW_ROOT = `https://raw.githubusercontent.com/${MANUAL_REPO}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const CACHE_ROOT = path.join(REPO_ROOT, "scripts", "cache", "manual");
const OUTPUT_DEFAULT = path.join(
  REPO_ROOT,
  "resources",
  "gml-identifiers.json",
);

const ARGUMENTS = process.argv.slice(2);

function parseArgs() {
  let ref = process.env.GML_MANUAL_REF ?? null;
  let outputPath = OUTPUT_DEFAULT;
  let forceRefresh = false;

  for (let i = 0; i < ARGUMENTS.length; i += 1) {
    const arg = ARGUMENTS[i];
    if ((arg === "--ref" || arg === "-r") && i + 1 < ARGUMENTS.length) {
      ref = ARGUMENTS[i + 1];
      i += 1;
    } else if (
      (arg === "--output" || arg === "-o") &&
      i + 1 < ARGUMENTS.length
    ) {
      outputPath = path.resolve(ARGUMENTS[i + 1]);
      i += 1;
    } else if (arg === "--force-refresh") {
      forceRefresh = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  return { ref, outputPath, forceRefresh };
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/generate-gml-identifiers.mjs [options]",
      "",
      "Options:",
      "  --ref, -r <git-ref>       Manual git ref (tag, branch, or commit). Defaults to latest tag.",
      "  --output, -o <path>       Output JSON path. Defaults to resources/gml-identifiers.json.",
      "  --force-refresh           Ignore cached manual artefacts and re-download.",
      "  --help, -h                Show this help message.",
    ].join("\n"),
  );
}

const BASE_HEADERS = {
  "User-Agent": "prettier-plugin-gml identifier generator",
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
    redirect: "follow",
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

async function resolveManualRef(ref) {
  if (ref) {
    return resolveCommitFromRef(ref);
  }

  const latestTagUrl = `${API_ROOT}/tags?per_page=1`;
  const body = await curlRequest(latestTagUrl, { acceptJson: true });
  const tags = JSON.parse(body);
  if (!Array.isArray(tags) || tags.length === 0) {
    console.warn("No manual tags found; defaulting to 'develop' branch.");
    return resolveCommitFromRef("develop");
  }
  const { name, commit } = tags[0];
  return {
    ref: name,
    sha: commit?.sha ?? null,
  };
}

async function resolveCommitFromRef(ref) {
  const url = `${API_ROOT}/commits/${encodeURIComponent(ref)}`;
  const body = await curlRequest(url, { acceptJson: true });
  const payload = JSON.parse(body);
  if (!payload?.sha) {
    throw new Error(`Could not determine commit SHA for ref '${ref}'.`);
  }
  return { ref, sha: payload.sha };
}

async function fetchManualFile(sha, filePath, { forceRefresh = false } = {}) {
  const cachePath = path.join(CACHE_ROOT, sha, filePath);
  if (!forceRefresh) {
    try {
      const cached = await fs.readFile(cachePath, "utf8");
      return cached;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const url = `${RAW_ROOT}/${sha}/${filePath}`;
  const content = await curlRequest(url);
  await ensureDir(path.dirname(cachePath));
  await fs.writeFile(cachePath, content, "utf8");
  return content;
}

function parseArrayLiteral(source, identifier) {
  const declaration = `const ${identifier} = [`;
  const start = source.indexOf(declaration);
  if (start === -1) {
    throw new Error(`Could not locate declaration for ${identifier} in gml.js`);
  }
  const bracketStart = source.indexOf("[", start);
  if (bracketStart === -1) {
    throw new Error(`Malformed array literal for ${identifier}`);
  }

  let index = bracketStart;
  let depth = 0;
  let inString = null;
  let escaped = false;
  while (index < source.length) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
    } else {
      if (char === '"' || char === "'" || char === "`") {
        inString = char;
      } else if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }
    index += 1;
  }

  const literal = source.slice(bracketStart, index);
  try {
    return vm.runInNewContext(literal, {}, { timeout: 5000 });
  } catch (error) {
    throw new Error(
      `Failed to evaluate array literal for ${identifier}: ${error.message}`,
    );
  }
}

function classifyFromPath(manualPath, tagList) {
  const normalizedTags = new Set(tagList.map((tag) => tag.toLowerCase()));
  const segments = manualPath.split("/").map((part) => part.toLowerCase());
  const hasSegment = (needles) =>
    segments.some((segment) =>
      needles.some((needle) => segment.includes(needle)),
    );

  const tagHas = (needles) =>
    needles.some((needle) => normalizedTags.has(needle));

  if (hasSegment(["functions"]) || tagHas(["function", "functions"])) {
    return "function";
  }
  if (hasSegment(["methods"]) || tagHas(["method", "methods"])) {
    return "method";
  }
  if (hasSegment(["events"]) || tagHas(["event", "events"])) {
    return "event";
  }
  if (hasSegment(["variables"]) || tagHas(["variable", "variables"])) {
    return "variable";
  }
  if (hasSegment(["accessors"]) || tagHas(["accessor", "accessors"])) {
    return "accessor";
  }
  if (hasSegment(["properties"]) || tagHas(["property", "properties"])) {
    return "property";
  }
  if (hasSegment(["macros"]) || tagHas(["macro", "macros"])) {
    return "macro";
  }
  if (hasSegment(["constants"]) || tagHas(["constant", "constants"])) {
    return "constant";
  }
  if (hasSegment(["enums"]) || tagHas(["enum", "enums"])) {
    return "enum";
  }
  if (hasSegment(["structs"]) || tagHas(["struct", "structs"])) {
    return "struct";
  }
  if (hasSegment(["layers"]) && hasSegment(["functions"])) {
    return "function";
  }
  if (hasSegment(["shaders"]) && hasSegment(["constants"])) {
    return "constant";
  }
  return "unknown";
}

const TYPE_PRIORITY = new Map([
  ["unknown", 0],
  ["guide", 1],
  ["reference", 1],
  ["keyword", 10],
  ["literal", 20],
  ["symbol", 30],
  ["macro", 40],
  ["constant", 50],
  ["enum", 60],
  ["variable", 70],
  ["property", 72],
  ["accessor", 75],
  ["event", 80],
  ["struct", 82],
  ["method", 85],
  ["function", 90],
]);

function mergeEntry(map, identifier, data) {
  const current = map.get(identifier);
  if (!current) {
    map.set(identifier, {
      type: data.type ?? "unknown",
      sources: new Set(data.sources ?? []),
      manualPath: data.manualPath ?? null,
      tags: new Set(data.tags ?? []),
      deprecated: Boolean(data.deprecated),
    });
    return;
  }

  for (const source of data.sources ?? []) {
    current.sources.add(source);
  }
  for (const tag of data.tags ?? []) {
    current.tags.add(tag);
  }
  if (data.manualPath && !current.manualPath) {
    current.manualPath = data.manualPath;
  }
  if (data.deprecated) {
    current.deprecated = true;
  }

  const incomingType = data.type ?? "unknown";
  const currentPriority = TYPE_PRIORITY.get(current.type) ?? 0;
  const incomingPriority = TYPE_PRIORITY.get(incomingType) ?? 0;
  if (incomingPriority > currentPriority) {
    current.type = incomingType;
  }
}

function normaliseIdentifier(name) {
  return name.trim();
}

async function main() {
  const { ref, outputPath, forceRefresh } = parseArgs();

  const manualRef = await resolveManualRef(ref);
  if (!manualRef.sha) {
    throw new Error(
      `Unable to resolve manual commit SHA for ref '${manualRef.ref}'.`,
    );
  }

  console.log(`Using manual ref '${manualRef.ref}' (${manualRef.sha}).`);

  const gmlSource = await fetchManualFile(
    manualRef.sha,
    "Manual/contents/assets/scripts/gml.js",
    { forceRefresh },
  );
  const keywordsArray = parseArrayLiteral(gmlSource, "KEYWORDS");
  const literalsArray = parseArrayLiteral(gmlSource, "LITERALS");
  const symbolsArray = parseArrayLiteral(gmlSource, "SYMBOLS");

  const identifierMap = new Map();

  for (const keyword of keywordsArray) {
    const identifier = normaliseIdentifier(keyword);
    mergeEntry(identifierMap, identifier, {
      type: "keyword",
      sources: ["manual:gml.js:KEYWORDS"],
    });
  }

  for (const literal of literalsArray) {
    const identifier = normaliseIdentifier(literal);
    mergeEntry(identifierMap, identifier, {
      type: "literal",
      sources: ["manual:gml.js:LITERALS"],
    });
  }

  for (const symbol of symbolsArray) {
    const identifier = normaliseIdentifier(symbol);
    mergeEntry(identifierMap, identifier, {
      type: "symbol",
      sources: ["manual:gml.js:SYMBOLS"],
    });
  }

  const keywordsJson = await fetchManualFile(
    manualRef.sha,
    "ZeusDocs_keywords.json",
    { forceRefresh },
  );
  const manualKeywords = JSON.parse(keywordsJson);
  const tagsJsonText = await fetchManualFile(
    manualRef.sha,
    "ZeusDocs_tags.json",
    { forceRefresh },
  );
  const manualTags = JSON.parse(tagsJsonText);

  const IDENTIFIER_PATTERN = /^[A-Za-z0-9_$.]+$/;

  for (const [rawIdentifier, manualPath] of Object.entries(manualKeywords)) {
    const identifier = normaliseIdentifier(rawIdentifier);
    if (!IDENTIFIER_PATTERN.test(identifier)) {
      continue;
    }

    if (typeof manualPath !== "string" || manualPath.length === 0) {
      continue;
    }

    const normalisedPath = manualPath.replace(/\\/g, "/");
    if (
      !normalisedPath.startsWith("3_Scripting") ||
      !normalisedPath.includes("4_GML_Reference")
    ) {
      continue;
    }

    const tagKeyCandidates = [
      `${normalisedPath}.html`,
      `${normalisedPath}/index.html`,
    ];
    let tagEntry;
    for (const key of tagKeyCandidates) {
      if (manualTags[key]) {
        tagEntry = manualTags[key];
        break;
      }
    }
    const tags = tagEntry
      ? tagEntry
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];

    const type = classifyFromPath(normalisedPath, tags);
    const deprecated =
      tags.some((tag) => tag.toLowerCase().includes("deprecated")) ||
      normalisedPath.toLowerCase().includes("deprecated");

    mergeEntry(identifierMap, identifier, {
      type,
      sources: ["manual:ZeusDocs_keywords.json"],
      manualPath: normalisedPath,
      tags,
      deprecated,
    });
  }

  const sortedIdentifiers = Array.from(identifierMap.entries())
    .map(([identifier, data]) => [
      identifier,
      {
        type: data.type,
        sources: Array.from(data.sources).sort(),
        manualPath: data.manualPath,
        tags: Array.from(data.tags).sort(),
        deprecated: data.deprecated,
      },
    ])
    .sort(([a], [b]) => a.localeCompare(b));

  const payload = {
    meta: {
      manualRef: manualRef.ref,
      commitSha: manualRef.sha,
      generatedAt: new Date().toISOString(),
      source: MANUAL_REPO,
    },
    identifiers: Object.fromEntries(sortedIdentifiers),
  };

  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(
    outputPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );

  console.log(`Wrote ${sortedIdentifiers.length} identifiers to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
