# setup-dotnet

The fastest way to setup .NET SDK/Runtime in your workflow.

Parallel downloads. Automatic caching. Smart version resolution. 

## Quick Setup

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '10.x.x'
```

That's it!

## Features

- **Flexible Installation**: Mix and match SDK, Runtime, or ASP.NET Core however you like
- **Parallel Downloads**: Sequential installs are so 2020. Downloads are running simultaneously
- **Smart Version Resolution**: Wildcards (`10.x.x`), keywords (`latest`, `lts`, `sts`), and `global.json`. All supported
- **Intelligent Deduplication**: Only download what you need. No more, no less
- **Automatic Caching**: Dramatically faster subsequent runs (seriously, it's fast)

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

## Performance

**Benchmark Results** (Ubuntu runner):

| Scenario | Official Action | fast-actions (without cache) | fast-actions (with cache) |
|----------|-----------------|------------------------------|----------------------|
| Multiple SDKs (10.x, 9.x, 8.x) | ~24s | ~15s | ~6s |
| Single SDK + Runtimes (SDK 10.x, ASP.NET Core 9.x + 8.x) | (Not possible) | ~9s | ~4s |

**Note**: Actual performance depends on various factors including runner specifications and network conditions.


## Documentation

For detailed documentation, advanced features, and more examples, see [guide.md](https://github.com/fast-actions/setup-dotnet/blob/main/docs/guide.md).

### Coming from actions/setup-dotnet?

Check out the [Migration Guide](https://github.com/fast-actions/setup-dotnet/blob/main/docs/migration.md) for a quick reference on how to switch to this action.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `sdk-version` | SDK version(s). Supports wildcards, keywords (`latest`, `lts`, `sts`), comma-separated, or YAML array. | No | – |
| `runtime-version` | Runtime version(s). Same format as `sdk-version`. | No | – |
| `aspnetcore-version` | ASP.NET Core Runtime version(s). Same format as `sdk-version`. | No | – |
| `global-json` | Path to `global.json` for SDK resolution. | No | `./global.json` |
| `cache` | Enable caching of .NET installations. | No | `true` |
| `allow-preview` | Allow preview releases when using keywords (`latest`, `lts`, `sts`). | No | `false` |

## Outputs

| Output | Description |
|--------|-------------|
| `dotnet-version` | Installed .NET versions (e.g., `sdk:9.0.100, runtime:8.0.0`) |
| `dotnet-path` | Path to .NET installation directory |
| `cache-hit` | Whether installation was restored from cache (`true`/`false`) |

## Why `fast-actions/setup-dotnet`?
I built this because I care a lot about workflow execution time. The official `actions/setup-dotnet` works great for most cases, but in my workflows it was consistently slower than I wanted (especially when the runner spends a bunch of time installing multiple SDKs/Runtimes).

I tried to improve the official action first: I opened a PR there, but it ended up being ignored/stalled. Rather than keep waiting, I rebuilt the idea with a different focus: faster installs, better parallelization, and caching.

This isn’t meant to replace the official action for everyone. If you don’t care about shaving minutes off CI, you can stick with `actions/setup-dotnet`. If you do care about execution time (or you install multiple versions regularly), `fast-actions/setup-dotnet` is for you.

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/fast-actions/setup-dotnet/blob/main/LICENSE) file for details.