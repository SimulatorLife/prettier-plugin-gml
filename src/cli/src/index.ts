import * as CliExports from "./cli.js";
import * as CliCore from "./cli-core/index.js";
import * as Commands from "./commands/index.js";
import * as Modules from "./modules/index.js";
import * as PluginRuntime from "./plugin-runtime/index.js";
import * as RuntimeOptions from "./runtime-options/index.js";
import * as Shared from "./shared/index.js";
import * as Types from "./types/index.js";
import * as Workflow from "./workflow/index.js";

export const CLI = Object.freeze({
    ...CliExports,
    CliCore,
    Commands,
    Modules,
    PluginRuntime,
    RuntimeOptions,
    Shared,
    Types,
    Workflow
});
