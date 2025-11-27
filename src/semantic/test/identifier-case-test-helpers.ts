import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildProjectIndex } from "../src/project-index/index.js";

type ScriptFixtureConfig =
    | string
    | {
          name?: string;
          fixture: string;
      };

type IdentifierCaseProject = {
    projectRoot: string;
    scripts: Array<{
        name: string;
        fixture: string;
        path: string;
        source: string;
    }>;
    scriptPaths: string[];
    scriptSources: string[];
    event: null | {
        fixture: string;
        path: string;
        source: string;
    };
    eventPath: string | null;
    projectIndex: Awaited<ReturnType<typeof buildProjectIndex>>;
};

export function resolveIdentifierCasePluginPath(
    currentDirectory: string
): string {
    const candidates = [
        path.resolve(currentDirectory, "../../plugin/dist/src/plugin-entry.js"),
        path.resolve(currentDirectory, "../../plugin/dist/index.js"),
        path.resolve(currentDirectory, "../../plugin/dist/src/index.js"),
        path.resolve(currentDirectory, "../../plugin/src/plugin-entry.js"),
        path.resolve(currentDirectory, "../../plugin/src/index.js"),
        path.resolve(currentDirectory, "../../plugin/src/plugin-entry.ts"),
        path.resolve(
            currentDirectory,
            "../../../plugin/dist/src/plugin-entry.js"
        ),
        path.resolve(currentDirectory, "../../../plugin/dist/index.js"),
        path.resolve(currentDirectory, "../../../plugin/dist/src/index.js"),
        path.resolve(currentDirectory, "../../../plugin/src/plugin-entry.js"),
        path.resolve(currentDirectory, "../../../plugin/src/index.js"),
        path.resolve(currentDirectory, "../../../plugin/src/plugin-entry.ts")
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return candidates[0];
}

export function resolveIdentifierCaseFixturesDirectory(
    baseDirectory: string,
    sampleFixture = "locals.gml"
): string {
    const candidates = [
        path.join(baseDirectory, "identifier-case-fixtures"),
        path.resolve(baseDirectory, "../../test/identifier-case-fixtures")
    ];

    for (const candidate of candidates) {
        if (existsSync(path.join(candidate, sampleFixture))) {
            return candidate;
        }
    }

    return candidates[0];
}

export async function createIdentifierCaseProject({
    fixturesDirectory,
    scriptFixtures = [{ name: "demo", fixture: "locals.gml" }],
    eventFixture = null,
    projectPrefix = "gml-identifier-case-"
}: {
    fixturesDirectory: string;
    scriptFixtures?: ScriptFixtureConfig[];
    eventFixture?: string | null;
    projectPrefix?: string;
}): Promise<IdentifierCaseProject> {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), projectPrefix));

    async function writeFile(relativePath: string, contents: string) {
        const absolutePath = path.join(tempRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    }

    await writeFile(
        "MyGame.yyp",
        JSON.stringify({ name: "MyGame", resourceType: "GMProject" })
    );

    const scripts: IdentifierCaseProject["scripts"] = [];
    const scriptPaths: string[] = [];
    const scriptSources: string[] = [];

    for (const [index, config] of scriptFixtures.entries()) {
        const scriptName =
            typeof config === "string"
                ? `script_${index}`
                : (config.name ?? `script_${index}`);
        const fixtureName =
            typeof config === "string" ? config : config.fixture;

        await writeFile(
            `scripts/${scriptName}/${scriptName}.yy`,
            JSON.stringify({ resourceType: "GMScript", name: scriptName })
        );

        const scriptFixturePath = path.join(
            fixturesDirectory,
            String(fixtureName)
        );
        const scriptSource = await fs.readFile(scriptFixturePath, "utf8");
        const scriptPath = await writeFile(
            `scripts/${scriptName}/${scriptName}.gml`,
            scriptSource
        );

        const scriptRecord = {
            name: scriptName,
            fixture: String(fixtureName),
            path: scriptPath,
            source: scriptSource
        };
        scripts.push(scriptRecord);
        scriptPaths.push(scriptPath);
        scriptSources.push(scriptSource);
    }

    let eventPath: string | null = null;
    let eventSource: string | null = null;
    if (eventFixture) {
        const eventFixturePath = path.join(fixturesDirectory, eventFixture);
        eventSource = await fs.readFile(eventFixturePath, "utf8");

        await writeFile(
            "objects/obj_scope/obj_scope.yy",
            JSON.stringify({
                resourceType: "GMObject",
                name: "obj_scope",
                eventList: [
                    {
                        resourceType: "GMEvent",
                        eventType: 0,
                        eventNum: 0,
                        eventContents: "objects/obj_scope/obj_scope_Create.gml"
                    }
                ]
            })
        );

        eventPath = await writeFile(
            "objects/obj_scope/obj_scope_Create.gml",
            eventSource
        );
    }

    const projectIndex = await buildProjectIndex(tempRoot);

    return {
        projectRoot: tempRoot,
        scripts,
        scriptPaths,
        scriptSources,
        event:
            eventPath && eventSource
                ? {
                      fixture: eventFixture ?? "",
                      path: eventPath,
                      source: eventSource
                  }
                : null,
        eventPath,
        projectIndex
    };
}
