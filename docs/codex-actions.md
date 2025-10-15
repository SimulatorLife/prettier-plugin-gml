# Codex automation playbook

The repository relies on a suite of Codex-assisted GitHub Actions to keep the
formatter codebase tidy. Each workflow seeds a dedicated pull request with clear
instructions so Codex can do targeted maintenance without human babysitting.

## Single Responsibility Guardrail

The **Codex SRP – Single Responsibility Guardrail** workflow (`codex-srp.yml`)
scans for functions that balloon past a configurable line limit and combine
multiple verb stems in their names (for example `initComputeRender`). Those cues
usually indicate that a single unit is juggling distinct duties. When triggered,
Codex proposes extracting helper functions so each piece of logic owns exactly
one change-triggering responsibility. The follow-up review should focus on
whether the extracted helpers keep behaviour intact, have meaningful names, and
leave the remaining code easier to extend without cascading edits.

Tweak the workflow dispatch inputs to adjust the acceptable line threshold or
to monitor a different list of verb cues. If a scheduled run finds no matches,
Codex reports the audit instead of forcing a refactor.
