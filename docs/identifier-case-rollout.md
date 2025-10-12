# Identifier case rollout playbook

This guide walks through configuring the experimental `gmlIdentifierCase` option,
collecting dry-run reports, and promoting the rollout from locals-only to a
full write mode. Follow the steps in order so the rename plan stays reviewable
and reversible at every milestone.

## Prerequisites

- Install the plugin inside the GameMaker project you plan to format so the
  Prettier configuration resolves local paths correctly.
- Ensure Node.js 18.18.0+, 20.9.0+, or 21.1.0+ is available (`node -v`).
- Commit your project before testing renames—dry-run mode leaves sources
  untouched, but generating the project index and logs produces new files.

## 1. Build or refresh the project index

The rename planner needs a project-wide index of declarations and references so
it can evaluate rename collisions. Generate the index from the GameMaker project
root (the folder that contains the `.yyp` manifest):

```bash
node --input-type=module <<'NODE'
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { buildProjectIndex } from "./node_modules/root/src/shared/project-index/index.js";

const projectRoot = process.cwd();
const reportsDir = path.join(projectRoot, ".gml-reports");
await mkdir(reportsDir, { recursive: true });

const index = await buildProjectIndex(projectRoot);
await writeFile(
    path.join(reportsDir, "project-index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8"
);
NODE
```

- Re-run the command whenever you add scripts or resources so the cache reflects
  the latest identifiers.
- Check the resulting `.gml-reports/project-index.json` into source control if
  you want deterministic renames across machines. Otherwise, regenerate it in
  CI prior to running Prettier.

## 2. Configure Prettier for a locals-first dry run

Copy [the sample configuration](examples/identifier-case/locals-first.prettierrc.mjs)
into your project root as `.prettierrc.mjs` (or merge the snippet into an
existing config). Key settings to note:

- `gmlIdentifierCase: "camel"` enables casing conversions, but every scope stays
  in observe-only mode until its override changes from `inherit`.
- `gmlIdentifierCaseLocals: "camel"` restricts renames to local variables—the
  lowest-risk scope for the first pass.
- `identifierCaseProjectIndex` points at the cached project index generated in
  step 1.
- `identifierCaseDryRun: true` ensures the formatter logs a report without
  touching source files.
- `identifierCaseReportLogPath` captures machine-readable output for peer review
  and regression tracking.

## 3. Run the dry run and capture reports

Format the project from the same directory that stores your `.yyp` file. The
command below reuses the installed plugin and the locals-first configuration:

```bash
npx prettier \
  --config ./prettierrc.mjs \
  --plugin=./node_modules/root/src/plugin/src/gml.js \
  --write "scripts/**/*.gml"
```

Dry-run mode leaves the files untouched, but you should see a console summary
for every file that has planned changes. A typical report looks like this:

```
[gml-identifier-case] Identifier case dry-run summary:
  Planned renames: 1 (3 references across 1 file)
  Conflicts: 2 (1 warning, 1 info)

Rename plan:
  - demo (Script): counter_value -> counterValue (3 references across 1 file)
      • scripts/demo/demo.gml (3 references)

Conflicts:
  - [warning] [collision] demo (Script) (collision_counter): Renaming 'collision_counter' to 'collisionCounter' collides with 'collisionCounter'.
  - [info] [preserve] demo (Script) (preserve_me): Identifier 'preserve_me' is preserved by configuration.
```

The JSON payload saved to `identifier-case-dry-run.json` mirrors these details;
see [the bundled sample report](examples/identifier-case/dry-run-report.json)
for the exact schema.

## 4. Share results for peer review

Reviewers should confirm that:

- Every rename listed in the console summary and JSON log matches the intended
  case style.
- Conflicts flagged as `collision`, `ignored`, or `preserve` align with your
  team’s naming rules. Update `gmlIdentifierCaseIgnore` or
  `gmlIdentifierCasePreserve` as needed.
- The project index reflects all scripts that will participate in the rollout.

Attach the dry-run JSON log to the review request so teammates can diff the plan
without running the formatter locally.

## 5. Expand scope incrementally

Once locals look good, flip additional scope overrides to the desired case style
one at a time, re-running the dry run and peer review between each change:

```diff
- gmlIdentifierCaseFunctions: "inherit",
+ gmlIdentifierCaseFunctions: "camel",
```

Consider the following order to keep the blast radius manageable:
locals → functions → structs → instance variables → globals → macros/defines.
Asset renames remain off until you explicitly opt in and acknowledge the disk
changes.

## 6. Promote to write mode

After peers approve the dry-run report:

1. Set `identifierCaseDryRun: false`.
2. Re-run Prettier with `--write` to apply renames to source files and related
   asset metadata.
3. Inspect the updated files plus the JSON report, then commit both so the
   rollout stays reproducible.

Keep the dry-run log path in place—write mode still emits a final summary so you
have an audit trail for the applied operations.

## Troubleshooting checklist

- **Missing renames:** Confirm the project index JSON contains the affected
  scripts and that `identifierCaseProjectIndex` points to it.
- **Unexpected conflicts:** Review the log for `collision` entries. Rename the
  conflicting declarations manually or adjust the desired case style for that
  scope.
- **Asset rename warnings:** Leave `gmlIdentifierCaseAssets` set to `off` until
  the team is ready to audit disk-level changes and set
  `gmlIdentifierCaseAcknowledgeAssetRenames: true`.
- **Stale index data:** Regenerate the project index after moving scripts or
  changing resource names. The dry-run report timestamps make it clear when the
  cache was last refreshed.

## Migration guidance

- Start with dry-run mode on a feature branch so game logic remains untouched
  while you evaluate the rename noise level.
- Capture both the project index and dry-run JSON in the branch to stabilise the
  plan across machines and CI agents.
- Schedule at least one reviewer familiar with the affected systems—peer review
  is the last chance to catch incorrect rename suggestions before write mode.
- Roll out additional scopes in separate pull requests; the dry-run logs double
  as a changelog your team can audit later.
