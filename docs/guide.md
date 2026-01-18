# Complete Guide to setup-dotnet

This guide covers all features, use cases, and advanced scenarios for `setup-dotnet`.

## Table of Contents

- [Installation Options](#installation-options)
- [Version Resolution](#version-resolution)
- [Caching](#caching)
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

---

## Caching

Caching is enabled by default and dramatically speeds up subsequent workflow runs.

### How Caching Works

1. **Version Resolution:** Wildcards and keywords are resolved to concrete versions (e.g., `9.x.x` → `9.0.105`)
2. **Cache Key Generation:** Cache key is created from platform, architecture, and **resolved versions**
3. **Cache Check:** If a matching cache exists, .NET is restored
4. **Fresh Download:** If no cache or version changed, .NET is downloaded and cached

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
    cache: true  # Default, can be omitted
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

## global.json Support

The action respects `global.json` for SDK version resolution, including `rollForward` policies.

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
Installs exactly `9.0.100`.

**Patch (latest patch):**
```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "patch"
  }
}
```
Resolves to `9.0.x` (latest patch in 9.0).

**Feature (latest feature band):**
```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "feature"
  }
}
```
Resolves to `9.0.x` (latest feature band in 9.0).

**Minor (latest minor):**
```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "minor"
  }
}
```
Resolves to `9.x.x` (latest minor in 9.x).

**Major (latest major):**
```json
{
  "sdk": {
    "version": "9.0.100",
    "rollForward": "major"
  }
}
```
Resolves to `x.x.x` (latest available version).

### Preview Versions in global.json

Preview versions require `allowPrerelease: true`:

```json
{
  "sdk": {
    "version": "10.0.100-preview.1.24607.1",
    "allowPrerelease": true
  }
}
```

Without `allowPrerelease`, the action throws an error to prevent accidental preview usage.

### Custom global.json Path

```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    global-json: './src/MyProject/global.json'
```

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
