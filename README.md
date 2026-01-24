# setup-dotnet

Fast .NET SDK/Runtime installation for GitHub Actions.

Parallel downloads, automatic caching, and smart version resolution.

## Quickstart

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '10.x'
```

## Features

- **Flexible installation**: Install SDK, Runtime, and/or ASP.NET Core Runtime
- **Parallel downloads**: Multiple requested versions download concurrently
- **Smart version resolution**: Wildcards (`10.x`, `10.x.x`) and keywords (`latest`, `lts`, `sts`)
- **Full `global.json` support**: Supports `global.json` file for SDK version resolution
- **Intelligent deduplication**: Skip redundant installs when an SDK already includes the requested runtimes
- **Automatic caching**: Cache the .NET installation directory to speed up subsequent runs
- **Conditional installation**: Uses pre-installed system .NET when all versions are present
- **Non-root installation**: Installs to user-writable tool cache without requiring root permissions

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

# Runtime-only (no SDK)
- uses: fast-actions/setup-dotnet@v1
  with:
    runtime-version: '8.0.x'

# From global.json
- uses: fast-actions/setup-dotnet@v1
```

## Version resolution

- **Wildcards**: `10.x` is treated as `10.x.x` and resolves to the latest matching version
- **Keywords**: `latest`, `lts`, `sts` resolve via the .NET releases index
- **Preview selection for keywords**: set `allow-preview: true` to include preview channels in keyword resolution

## Caching

- Enabled by default (`cache: true`)
- Cache keys include OS + architecture + _resolved_ versions (not the input patterns)
- If `10.x` resolves to a newer patch later, the cache key changes and the action downloads the newer version

## Performance

**Benchmark Results** (`ubuntu-latest`):

| Scenario                                                 | Official Action | fast-actions (without cache) | fast-actions (with cache) |
| -------------------------------------------------------- | --------------- | ---------------------------- | ------------------------- |
| Multiple SDKs (10.x, 9.x, 8.x)                           | ~24s            | ~15s                         | ~6s                       |
| Single SDK + Runtimes (SDK 10.x, ASP.NET Core 9.x + 8.x) | (Not possible)  | ~9s                          | ~4s                       |

**Note**: Actual performance depends on various factors including runner specifications and network conditions.

## Documentation

For detailed documentation, advanced features, and more examples, see [docs/guide.md](https://github.com/fast-actions/setup-dotnet/blob/main/docs/guide.md).

### Coming from actions/setup-dotnet?

Check out the [Migration Guide](https://github.com/fast-actions/setup-dotnet/blob/main/docs/migration.md) for a quick reference on how to switch to this action.

## Inputs

| Input                | Description                                                                                                                                 | Required | Default         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------- |
| `sdk-version`        | SDK version(s). Supports wildcards, keywords (`latest`, `lts`, `sts`), comma-separated, or YAML array. Takes precedence over `global.json`. | No       | –               |
| `runtime-version`    | Runtime version(s). Same format as `sdk-version`.                                                                                           | No       | –               |
| `aspnetcore-version` | ASP.NET Core Runtime version(s). Same format as `sdk-version`.                                                                              | No       | –               |
| `global-json`        | Path to `global.json` for SDK resolution (SDK only). Defaults to `./global.json` in the workspace root when omitted.                        | No       | `./global.json` |
| `cache`              | Enable caching of .NET installations.                                                                                                       | No       | `true`          |
| `allow-preview`      | Allow preview releases when resolving keywords (`latest`, `lts`, `sts`).                                                                    | No       | `false`         |

## Outputs

| Output           | Description                                                   |
| ---------------- | ------------------------------------------------------------- |
| `dotnet-version` | Installed .NET versions (e.g., `sdk:9.0.100, runtime:8.0.0`)  |
| `dotnet-path`    | Path to .NET installation directory                           |
| `cache-hit`      | Whether installation was restored from cache (`true`/`false`) |

## Motivation behind `fast-actions/setup-dotnet`

I built this GitHub Action because I care a lot about workflow execution time. The official `actions/setup-dotnet` works great for most cases, but in my workflows it was consistently slower than I wanted (especially when the runner spends a bunch of time installing multiple SDKs/Runtimes).

I tried to improve the official action first: I opened a PR there, but it ended up being ignored/stalled. Rather than keep waiting, I rebuilt the idea with a different focus: faster installs, better parallelization, and caching.

This isn’t meant to replace the official action for everyone. If you don’t care about shaving minutes off CI, you can stick with `actions/setup-dotnet`. If you do care about execution time (or you install multiple versions regularly), `fast-actions/setup-dotnet` is for you.

## License

This project is licensed under the MIT License. See [LICENSE](https://github.com/fast-actions/setup-dotnet/blob/main/LICENSE).
