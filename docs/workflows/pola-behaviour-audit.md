# POLA behaviour audit workflow

The "Codex: POLA Behaviour Audit" automation focuses on the Principle of Least
Astonishment. The workflow triages spots where comments, option descriptions, or
user-facing docs promise one outcome but the code implements another. Keeping
expectations and reality aligned prevents configuration foot-guns and helps
contributors trust the formatter.

## Review checklist

When Codex opens a pull request for this workflow:

1. **Confirm the contradiction.** Reproduce the cited behaviour gap by reading
   the implementation and, when possible, running the relevant tests or script.
   The example should demonstrate how a player or contributor would be
   surprised.
2. **Decide between code or docs.** Evaluate whether correcting the behaviour or
   clarifying the documentation best honours the published contract. Prefer
   fixing code if existing users rely on the documented promise; otherwise, make
   the docs explicit about the actual runtime behaviour.
3. **Check for ripple effects.** If code changes are proposed, ensure new tests
   cover the clarified behaviour and that neighbouring options or helper
   routines stay consistent. For documentation updates, verify that all
   references to the option (README, CLI help, inline comments) reflect the new
   wording.
4. **Document the resolution.** Expect the PR body to explain the original
   mismatch and the reasoning behind the chosen fix. Request revisions if the
   trade-offs or migration notes are unclear.

Following this checklist keeps the formatter predictable and reduces "surprise"
bugs stemming from mismatched intent and implementation.
