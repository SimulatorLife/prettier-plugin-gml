# Refactor Test Fixtures

Refactor fixtures use project-tree cases rather than single files.

Each case directory must include:

- `project/`
- `expected/`
- `gmloop.json`

Example:

```json
{
  "refactor": {
    "codemods": {
      "loopLengthHoisting": {}
    }
  },
  "fixture": {
    "kind": "refactor",
    "assertion": "project-tree"
  }
}
```

Do not edit fixture `.gml` contents to make a failing test pass. Update refactor logic or tests first.
