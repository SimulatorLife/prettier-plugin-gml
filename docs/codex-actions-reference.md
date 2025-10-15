# Codex Action Reference

## Abstraction Layer Stewardship (codex-sla)

- **Workflow**: `.github/workflows/codex-sla.yml`
- **Cadence**: Scheduled every four hours with an option for manual dispatch when urgent review is required.
- **Objective**: Locate orchestrator-style functions that mix high-level sequencing with inline primitive work such as array/index manipulation, and restructure them so low-level mechanics live in named helpers.
- **SLA Expectation**: Each Codex run that opens this workflow's PR should land a refinement keeping the orchestrator at a single abstraction layer—delegating detailed bookkeeping to helpers, documenting new contracts, and preserving behaviour with existing or new tests as needed.
