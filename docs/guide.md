# Complete Guide to setup-dotnet

This guide covers all features, use cases, and advanced scenarios for `setup-dotnet`.

## Table of Contents

- [Installation Options](#installation-options)
- [Version Resolution](#version-resolution)
- [Caching](#caching)
- [Security](#security)
- [global.json Support](#globaljson-support)
- [Real-World Use Cases](#real-world-use-cases)
- [Advanced Scenarios](#advanced-scenarios)
- [Troubleshooting](#troubleshooting)

---

## Installation Options

### SDK, Runtime, and ASP.NET Core

You can install SDK, Runtime, and ASP.NET Core separately or in combination. The action intelligently avoids redundant installations.

#### Install SDK only

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.100'
```

The SDK includes the .NET Runtime and ASP.NET Core Runtime, so no additional installations are needed for most scenarios.

#### Install Runtime only

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    runtime-version: '8.0.0'
```

Use this for runtime-only scenarios where you don't need to build code (e.g., running pre-compiled applications).

#### Install ASP.NET Core Runtime only

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    aspnetcore-version: '8.0.0'
```

ASP.NET Core Runtime includes the .NET Runtime, so both are available.

#### Combined Installation

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.100'
    runtime-version: '7.0.0'
    aspnetcore-version: '6.0.0'
```

The action automatically skips redundant installations. If the SDK already includes a runtime version, it won't be downloaded separately.

---

## System Detection and DOTNET_ROOT

The action intelligently handles pre-installed .NET versions on the system to ensure consistent behavior.

### How it works

**All requested versions already installed:**

- Action detects that all versions are present on the system
- No installation is performed
- `DOTNET_ROOT` is **not set** (preinstalled .NET is used)
- Workflow continues using the system's .NET installation

**At least one version is missing:**

- Action installs **all requested versions** (including already installed ones)
- `DOTNET_ROOT` is set to point to the action's installation directory
- This ensures `DOTNET_ROOT` always points to a complete, consistent location with all requested versions

### Example Scenarios

**Scenario 1: All versions present**

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.x'
```

If SDK 9.0.x (latest .NET 9 SDK) is already installed on the runner:

- No download happens
- Uses system .NET

**Scenario 2: Partial installation**

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.100, 8.0.400'
```

If only 9.0.100 is on the system:

- 📦 Installs **both** 9.0.100 and 8.0.400
- 📍 Sets `DOTNET_ROOT` to action's directory
- ✅ Guarantees all versions are in one location

**Why this approach?**

This ensures `DOTNET_ROOT` consistently points to a single location containing all requested versions, avoiding conflicts between different installation paths. We also avoid installing to the default .NET locations on the system, as this would require root permissions.

### Non-Root Installation

When the action installs .NET, it uses the standard GitHub Actions tool cache location (typically `$RUNNER_TOOL_CACHE`), which is a user-writable directory. No `sudo` or administrator rights are required.

---

## Version Resolution

### Wildcards

Use wildcards to automatically get the latest version matching a pattern:

```yaml
# Latest patch in 9.0.x
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.x'

# Latest minor in 9.x
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.x.x'
```

**How it works:** The action queries the .NET releases API and selects the highest version matching your pattern.

### Keywords

Use semantic keywords for common scenarios:

```yaml
# Latest Long-Term Support version
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 'lts'

# Latest Standard Term Support version
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 'sts'

# Latest available version (any support tier)
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 'latest'
```

### Multiple Versions

Install multiple versions using comma-separated or YAML array syntax:

```yaml
# Comma-separated
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.100, 8.0.400'

# YAML array
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: |
      9.0.100
      8.0.400
      7.0.200
```

All versions download in parallel for maximum speed.

### Preview Versions

Preview/RC versions are fully supported:

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '10.0.100-preview.1.24607.1'
```

You can also use the `allow-preview` parameter with keywords to automatically get the latest preview release:

```yaml
# Get the latest SDK, including preview releases
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 'latest'
    allow-preview: true
```

**When to use `allow-preview`:**

- Testing against upcoming .NET versions before GA
- Validating compatibility with preview releases

**Default behavior:** Without `allow-preview: true`, keywords (`latest`, `lts`, `sts`) only resolve to stable releases.

---

## Caching

Caching is enabled by default and dramatically speeds up subsequent workflow runs.

### How Caching Works

The action uses a three-tier caching strategy:

1. **Installation directory** (persistent across workflow runs) - checked first
2. **Local cache** (temporary per-version cache) - used during installation
3. **GitHub Actions cache** (remote) - restored if local caches miss

**Installation flow:**

1. **Version Resolution:** Wildcards and keywords are resolved to concrete versions (e.g., `9.x.x` → `9.0.105`)
2. **Cache Key Generation:** Cache key is created from platform, architecture, and **resolved versions**
3. **Check installation directory:** If version exists, use it immediately
4. **Check local cache:** If found, copy to installation directory
5. **Check GitHub Actions cache:** If enabled and found, restore and use
6. **Fresh Download:** If all caches miss, download and cache at all levels

**Important:** The cache key uses the **resolved version**, not the input pattern. If you specify `10.x.x` and a new patch `10.0.106` is released, the action will:

- Resolve `10.x.x` → `10.0.106` (new version)
- Generate new cache key for `10.0.106`
- Miss the old cache (was for `10.0.105`)
- Download and cache `10.0.106`

This ensures you always get the latest matching version without stale caches.

### Cache Example

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.100'
    cache: true # Default, can be omitted
```

### Disable Caching

For scenarios where you always want fresh downloads:

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '9.0.100'
    cache: false
```

### Check Cache Hit

The `cache-hit` output can be:

- `true` - all versions restored from cache
- `false` - no versions found in cache (all downloaded)
- `partial` - some versions cached, others downloaded

```yaml
- uses: fast-actions/setup-dotnet@v1
  id: dotnet
  with:
    sdk-version: '9.0.100'

- name: Cache status
  run: |
    echo "Cache hit: ${{ steps.dotnet.outputs.cache-hit }}"
    echo "Installed: ${{ steps.dotnet.outputs.dotnet-version }}"
```

---

## Security

### Verified downloads

This action verifies downloads with **SHA-512** hashes from the official .NET release manifests before installing.

### Pinning the action to a commit SHA

For maximum supply-chain safety, you can pin the action to a specific commit SHA (instead of a moving tag like `v1`):

```yaml
- uses: fast-actions/setup-dotnet@<commit-sha> # v1
  with:
    sdk-version: 'lts'
```

This ensures you always run the exact same action code until you intentionally update the pinned SHA.

## global.json Support

The action respects `global.json` for SDK version resolution, including `rollForward` policies and `allowPrerelease` settings. It follows the official .NET SDK global.json specification while adapting the behavior for CI/CD environments.

### Basic Usage

**global.json:**

```json
{
  "sdk": {
    "version": "9.0.100"
  }
}
```

**Workflow:**

```yaml
- uses: fast-actions/setup-dotnet@v1
```

If `sdk-version` input is provided, it takes precedence over `global.json`.

### Optional Version Field

If no `version` is specified in global.json, the action defaults to `latest`:

**global.json:**

```json
{
  "sdk": {
    "rollForward": "latestMajor"
  }
}
```

This installs the latest available SDK, respecting the `allow-preview` setting.

### rollForward Policies

`rollForward` controls how the SDK version is resolved. The action translates these policies into wildcard patterns:

**Disable (exact match):**

```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "disable"
  }
}
```

Installs exactly `9.0.100` (no wildcards applied).

**Patch / latestPatch (latest patch):**

```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "patch"
  }
}
```

Resolves to `9.0.x` (latest patch in 9.0).

**Feature / latestFeature (latest feature band):**

```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "feature"
  }
}
```

Resolves to `9.0.x` (latest feature band in 9.0).

**Minor / latestMinor (latest minor):**

```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "minor"
  }
}
```

Resolves to `9.x.x` (latest minor in 9.x).

**Major / latestMajor (latest major):**

```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "major"
  }
}
```

Resolves to `latest` (latest available version).

### Preview Versions in global.json

Preview versions are fully supported. Use `allowPrerelease` to control whether preview releases are included when resolving versions:

**With allowPrerelease:**

```json
{
  "sdk": {
    "version": "10.0.100-preview.1.24607.1",
    "allowPrerelease": true
  }
}
```

**Without allowPrerelease (default):**

```json
{
  "sdk": {
    "version": "9.0.100",
    "allowPrerelease": false
  }
}
```

**Example with rollForward:**

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestMajor",
    "allowPrerelease": true
  }
}
```

This resolves to the latest available SDK, including preview releases.

### Custom global.json Path

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    global-json: './src/MyProject/global.json'
```

### Comments in global.json

JSON with Comments (JSONC) is fully supported:

```jsonc
{
  "sdk": {
    // Install latest LTS version
    "version": "8.0.100",
    "rollForward": "latestFeature",
  },
}
```

### Validation

The action validates global.json contents:

**Valid formats:**

- Full version: `9.0.100`
- Preview version: `10.0.100-preview.1.24607.1`

**Note:** Wildcards are not supported in the `version` field per the official .NET SDK specification. Use `rollForward` policies to achieve similar behavior.

---

## Real-World Use Cases

### 1. Multi-Target Testing

**Scenario:** Build with the latest SDK, but test against multiple runtime versions to ensure compatibility.

**Workflow:**

```yaml
name: Multi-Target Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: fast-actions/setup-dotnet@v1
        with:
          sdk-version: 'latest'
          runtime-version: |
            9.0.0
            8.0.0
            7.0.0

      - name: Build with latest SDK
        run: dotnet build

      - name: Test on .NET 9
        run: dotnet test --framework net9.0

      - name: Test on .NET 8
        run: dotnet test --framework net8.0

      - name: Test on .NET 7
        run: dotnet test --framework net7.0
```

**Why this works:** The SDK can build for any target framework, but having the specific runtimes installed ensures accurate testing of runtime-specific behavior.

### 2. Monorepo with Mixed .NET Versions

**Scenario:** Monorepo with services using different .NET versions.

**Workflow:**

```yaml
name: Monorepo CI

on: [push, pull_request]

jobs:
  build-all:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: fast-actions/setup-dotnet@v1
        with:
          sdk-version: |
            9.0.100
            8.0.400
            7.0.200

      - name: Build Service A (.NET 9)
        working-directory: ./services/service-a
        run: dotnet build

      - name: Build Service B (.NET 8)
        working-directory: ./services/service-b
        run: dotnet build

      - name: Build Service C (.NET 7)
        working-directory: ./services/service-c
        run: dotnet build
```

**Benefits:**

- All SDKs download in parallel
- Single action call for entire monorepo
- Avoids redundant installations

### 6. Cross-Platform Testing

**Scenario:** Ensure your app works on Windows, Linux, and macOS.

**Workflow:**

```yaml
name: Cross-Platform

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6

      - uses: fast-actions/setup-dotnet@v1
        with:
          sdk-version: 'lts'

      - run: dotnet test
```

**Benefits:**

- Caching works per OS
- Parallel execution across platforms
- Same action configuration everywhere

---

## Troubleshooting

### Version Not Found

**Error:** `No matching version found for pattern: 10.x.x`

**Solution:** The version doesn't exist yet or pattern is too broad. Check available versions at [.NET Downloads](https://dotnet.microsoft.com/download/dotnet).

### Cache Not Restoring

**Symptoms:** Action downloads .NET every time despite caching enabled.

**Possible causes:**

- Cache key changed (different versions, platform, or architecture)
- GitHub Actions cache expired (7 days unused)
- Cache storage limit reached (10 GB per repository)

**Solution:** This is expected behavior. The action will re-download and re-cache.

### Download Failures

**Error:** `Failed to download .NET sdk 9.0.100`

**Solution:** The action automatically retries downloads 3 times. If it still fails, it's usually a temporary issue with Microsoft's servers. Re-run the workflow.

### Permission Errors

**Error:** `EACCES: permission denied`

**Solution:** This is rare but can happen on self-hosted runners. Ensure the runner has write access to `RUNNER_TOOL_CACHE` directory.

---

## Performance Tips

1. **Use caching** (enabled by default) for fastest workflows
2. **Install multiple versions in one step** instead of multiple action calls
3. **Use wildcards** for automatic updates without changing workflow
4. **Leverage parallel downloads** by specifying multiple versions

---

## Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/fast-actions/setup-dotnet).

## License

MIT – see [LICENSE](../LICENSE)
