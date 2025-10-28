# Core option overrides hook

## Pre-change analysis
- **Current behaviour:** The plugin entry point in `src/plugin/src/gml.js` freezes a `CORE_OPTION_OVERRIDES` map that forces a handful of Prettier core options (for example `trailingComma: "none"` and `arrowParens: "always"`). Hosts that want to keep most defaults but relax or remove one of these clamps must fork the module because the overrides are not configurable.
- **Proposed seam:** Introduce a resolver hook that produces the override map on demand. The hook keeps the existing defaults, validates incoming values against the supported Prettier choices, and allows hosts to either swap a value or drop an override entirely by returning `null`/`undefined` for that key.
- **Default preservation:** Without a registered resolver we continue returning the frozen default override object, so `gml.js` merges the exact same map and all published behaviour stays opinionated by default.

## Overview
Advanced embedders such as custom CLI wrappers or editor integrations can now call
`setCoreOptionOverridesResolver` to adjust the hard-coded overrides without exposing
extra user configuration. The resolver receives the Prettier option bag (currently unused)
and should return a partial override object: omit a property or return `null` to let user
configs apply, or provide an alternate value like `"es5"` for `trailingComma`. Guardrails
ensure only recognised Prettier values are accepted, falling back to the default map otherwise.

Restore the defaults at any time with `restoreDefaultCoreOptionOverridesResolver`. The helper
returns the canonical override map so wrappers can snapshot it when toggling behaviour.

## Usage example
```js
import {
    DEFAULT_CORE_OPTION_OVERRIDES,
    setCoreOptionOverridesResolver
} from "prettier-plugin-gamemaker/src/options/core-option-overrides.js";

// Allow project-level trailingComma settings to take effect while keeping
// other opinionated defaults unchanged.
setCoreOptionOverridesResolver(() => ({
    trailingComma: null,
    arrowParens: DEFAULT_CORE_OPTION_OVERRIDES.arrowParens
}));
```

## Future evolution
The resolver currently guards the existing override keys. If the plugin adopts new
opinionated clamps we can extend the validator table without breaking existing hooks.
Likewise, future call sites may forward richer context (for example, workspace metadata)
through the resolver parameters while keeping the default implementation side-effect free.
