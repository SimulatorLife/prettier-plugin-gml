# Examples

This directory now points to the vendored 3DSpider GameMaker project, which serves as the primary hot-reload demo and integration testbed.

## Hot Reload Demo (3DSpider)

The demo project lives at `vendor/3DSpider` as a git submodule. The CLI watch command reads it in place, without modifying files.

**Quick Start:**

```bash
# 1. Ensure the submodule is initialized
git submodule update --init --recursive

# 2. Start the watch command
npm run demo:watch
```

## Documentation

For more information, see:

- [docs/live-reloading-concept.md](../docs/live-reloading-concept.md) - Complete architecture and design
- [docs/hot-reload-integration-example.md](../docs/hot-reload-integration-example.md) - API reference
- [vendor/3DSpider/](../vendor/3DSpider/) - 3DSpider GameMaker project (submodule)
