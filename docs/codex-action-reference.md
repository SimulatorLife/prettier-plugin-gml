# Codex automation reference

This catalog describes the Codex automation that regularly opens follow-up pull
requests. Each entry summarises the workflow's intent so contributors know what
to expect when Codex files a patch and how to review it effectively.

## Document intent sweeps (`codex-document-intent.yml`)

Codex inspects inline comments for phrases like "no-op" or imperative "do X"
notes that skip the underlying rationale. When it finds fragile or
context-dependent sections annotated with throwaway comments, Codex proposes
clarifying the note so future contributors understand the behaviour being
protected. Expect updates that:

- expand short comments with the reasoning behind guard clauses or unusual
  control flow;
- call out risks if the surrounding implementation changes; and
- link to design documents or reference guides whenever the context lives
  outside the file.

Reviewers should ensure the suggested explanations accurately reflect the code
path and that any new links point at durable documentation.
