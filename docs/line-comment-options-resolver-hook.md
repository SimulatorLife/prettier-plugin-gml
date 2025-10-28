# Line Comment Options Resolver Hook

## Pre-change analysis
- **Current behaviour:** `resolveLineCommentOptions` always returns the frozen `DEFAULT_LINE_COMMENT_OPTIONS` object that encodes the formatter's heuristics for stripping boilerplate banners and treating commented-out code specially. The resolver ignores both the Prettier option bag and any ad-hoc overrides, so downstream tooling cannot adjust those heuristics without forking the formatter.
- **Proposed seam:** introduce a narrowly scoped resolver hook that lets integrators register a function for computing the line comment heuristics. The hook will default to the existing implementation and reuse the same normalization helpers so callers can extend the boilerplate fragments or code detection patterns while still benefitting from the plugin's guardrails.
- **Default preservation:** when no custom resolver is registered we continue to return the original default object, so existing users and tests observe identical behaviour. Custom resolvers feed through the same normalization pipeline, ensuring missing or invalid pieces still fall back to today's defaults.

## Overview
The new `setLineCommentOptionsResolver` and `restoreDefaultLineCommentOptionsResolver` exports let embedders (such as custom CLI wrappers or language server hosts) adjust the comment heuristics without exposing additional end-user configuration. Registered resolvers receive the Prettier option bag, but the default resolver keeps ignoring it so formatting remains opinionated unless a host deliberately installs an override.

The normalization helpers keep enforcing sensible defaults: callers can add more boilerplate fragments or regular-expression detectors, yet any malformed input collapses back to the standard list. Over time we can extend the resolver contract to expose richer context (for example, project metadata) while maintaining the same default resolver and guardrails.
