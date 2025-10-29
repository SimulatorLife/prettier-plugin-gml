// Focused facade exposing CLI module helpers that rely on the plugin runtime.
//
// Historically modules imported these utilities via ../dependencies.js, which
// also re-exported every shared CLI helper. That wide surface meant that even
// commands that only needed standard utilities still pulled in the plugin
// runtime wiring. Centralising the plugin runtime accessors here keeps the core
// dependency bundle lean and makes the runtime boundary explicit for consumers
// that actually need it.
export {
    importPluginModule,
    resolvePluginEntryPoint
} from "../plugin-runtime/entry-point.js";

export { resolvePluginEntryPoint as resolveCliPluginEntryPoint } from "../plugin-runtime/entry-point.js";
