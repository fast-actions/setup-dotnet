# dotnet-setup-fast

A high-performance GitHub Action for downloading and automatically caching .NET SDK and Runtime.

## Features

- 🚀 Fast .NET SDK and Runtime installation
- 💾 Automatic caching for improved performance
- 🎯 Support for specific versions and quality levels
- 🏗️ Architecture-specific installations (x64, arm64, arm)
- ⚡ Optimized for CI/CD workflows

## Usage

```yaml
- name: Setup .NET
  uses: your-username/dotnet-setup-fast@v1
  with:
    dotnet-version: '8.0.x'
    cache-enabled: 'true'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `dotnet-version` | .NET SDK version to install (e.g., 8.0.x, 9.0.x) | Yes | - |
| `install-runtime-only` | Install only the .NET Runtime instead of the full SDK | No | `false` |
| `cache-enabled` | Enable automatic caching of .NET installation | No | `true` |
| `architecture` | Target architecture (x64, arm64, arm) | No | `x64` |
| `quality` | Quality level of the .NET version (daily, preview, ga) | No | `ga` |

## Outputs

| Output | Description |
|--------|-------------|
| `dotnet-version` | The installed .NET version |
| `cache-hit` | Whether the .NET installation was restored from cache |
| `dotnet-path` | Path to the installed .NET directory |

## Examples

### Install specific .NET SDK version

```yaml
- uses: your-username/dotnet-setup-fast@v1
  with:
    dotnet-version: '8.0.x'
```

### Install .NET Runtime only

```yaml
- uses: your-username/dotnet-setup-fast@v1
  with:
    dotnet-version: '8.0.x'
    install-runtime-only: 'true'
```

### Disable caching

```yaml
- uses: your-username/dotnet-setup-fast@v1
  with:
    dotnet-version: '8.0.x'
    cache-enabled: 'false'
```

## Development

Built with TypeScript, pnpm, and Vite.

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm run build
```

## License

MIT
