#!/usr/bin/env node
import { runGenerateGmlIdentifiersCli } from "../src/cli/generate-gml-identifiers.js";

const exitCode = await runGenerateGmlIdentifiersCli();
if (typeof exitCode === "number") {
    process.exitCode = exitCode;
}
