#!/usr/bin/env node
import { runGenerateFeatherMetadataCli } from "../src/cli/generate-feather-metadata.js";

const exitCode = await runGenerateFeatherMetadataCli();
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
