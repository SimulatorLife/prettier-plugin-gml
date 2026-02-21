export { defaultOptions, languages, pluginOptions as options, parsers, Plugin, printers } from "./plugin-entry.js";
export { normalizeFormattedOutput } from "./printer/normalize-formatted-output.js";

/**
 * Configure the identifier-case integration runtime for the plugin.
 * Allows the CLI and semantic layer to inject scope tracking and rename
 * services without requiring the plugin to depend on those workspaces.
 */
export function configureIdentifierCaseIntegration(_configuration: Record<string, unknown>): void {
    // Integration point: consumed by the semantic test harness and CLI adapter.
    // The actual wiring is expected to be added when the identifier-case
    // runtime bridge is implemented in the plugin.
}

/**
 * Set the identifier-case runtime used by the plugin's printer.
 * This lightweight entry point is used by the CLI runtime adapter
 * to inject scope tracking without a full reconfiguration.
 */
export function setIdentifierCaseRuntime(_runtime: unknown): void {
    // Integration point: consumed by the CLI plugin runtime adapter.
}
