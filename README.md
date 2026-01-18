# setup-dotnet

High-performance GitHub Action for .NET SDK/Runtime installation with parallel downloads, intelligent version resolution, and caching.

## Quick Setup

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '10.x.x'
```

That's it! The action automatically:
- Downloads the latest .NET 10 SDK
- Adds it to PATH
- Caches for future runs

## Features

- **Flexible Installation** – Install SDK, Runtime, or ASP.NET Core separately or combined
- **Parallel Downloads** – Multiple versions download simultaneously
- **Smart Version Resolution** – Wildcards (`10.x.x`), keywords (`latest`, `lts`, `sts`), and `global.json` support
- **Automatic Caching** – Speeds up subsequent workflow runs dramatically
- **Intelligent Deduplication** – Skips redundant installations (SDK includes runtimes)

## Common Use Cases

```yaml
# Use latest LTS SDK
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 'lts'

# Multi-target testing (latest SDK + multiple runtimes)
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 'latest'
    runtime-version: |
      9.0.0
      8.0.0
      7.0.0

# From global.json
- uses: fast-actions/setup-dotnet@v1
```

## Documentation

For detailed documentation, advanced features, and more examples, see [guide.md](https://github.com/fast-actions/setup-dotnet/blob/main/docs/guide.md).

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `sdk-version` | SDK version(s). Supports wildcards, keywords (`latest`, `lts`, `sts`), comma-separated, or YAML array. | No | – |
| `runtime-version` | Runtime version(s). Same format as `sdk-version`. | No | – |
| `aspnetcore-version` | ASP.NET Core Runtime version(s). Same format as `sdk-version`. | No | – |
| `global-json` | Path to `global.json` for SDK resolution. | No | `./global.json` |
| `cache` | Enable caching of .NET installations. | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `dotnet-version` | Installed .NET versions (e.g., `sdk:9.0.100, runtime:8.0.0`) |
| `dotnet-path` | Path to .NET installation directory |
| `cache-hit` | Whether installation was restored from cache (`true`/`false`) |

## License

MIT – see [LICENSE](LICENSE)