# Copilot Instructions for fast-actions/setup-dotnet

## Project Overview

GitHub Action for .NET SDK/Runtime installation with caching. TypeScript + Vite + Biome. This is a custom action published as `fast-actions/setup-dotnet`. This is NOT the official `actions/setup-dotnet` GitHub Action and we don't want to use the official Action.

## Architecture

### Core Modules

- [src/main.ts](../src/main.ts) - Entry point, orchestrates installer and global.json reading
- [src/installer.ts](../src/installer.ts) - .NET download/installation via `@actions/tool-cache`
- [src/types.ts](../src/types.ts) - Core type definitions (DotnetType, VersionSet, ReleaseManifest)
- [src/installer.types.ts](../src/installer.types.ts) - Installer-specific types (InstallResult, DownloadInfo)

### Utilities

- [src/utils/global-json-reader.ts](../src/utils/global-json-reader.ts) - Reads and parses global.json for SDK version resolution with rollForward support
- [src/utils/global-json.types.ts](../src/utils/global-json.types.ts) - Type definitions for global.json structure
- [src/utils/input-parser.ts](../src/utils/input-parser.ts) - Parses version inputs (comma-separated, multiline, YAML array)
- [src/utils/platform-utils.ts](../src/utils/platform-utils.ts) - Platform and architecture detection for download URLs
- [src/utils/dotnet-detector.ts](../src/utils/dotnet-detector.ts) - Detects installed .NET versions on the system
- [src/utils/cache-utils.ts](../src/utils/cache-utils.ts) - Unified cache key generation and cache restore/save operations
- [src/utils/cache.types.ts](../src/utils/cache.types.ts) - Type definitions for caching (VersionEntry)
- [src/utils/output-formatter.ts](../src/utils/output-formatter.ts) - Formats and logs installation results for user output

### Versioning

- [src/utils/versioning/version-resolver.ts](../src/utils/versioning/version-resolver.ts) - Version wildcard resolution, keyword support (lts, sts, latest), and semver comparison
- [src/utils/versioning/version-deduplicator.ts](../src/utils/versioning/version-deduplicator.ts) - Removes redundant SDK/Runtime installations using SDK/Runtime mapping
- [src/utils/versioning/sdk-runtime-mapper.ts](../src/utils/versioning/sdk-runtime-mapper.ts) - Maps SDK versions to included runtimes to prevent duplicate installations
- [src/utils/versioning/release-cache.ts](../src/utils/versioning/release-cache.ts) - Fetches and caches .NET release manifests
- [src/utils/versioning/versioning.types.ts](../src/utils/versioning/versioning.types.ts) - Type definitions for version resolution (ReleaseInfo, ResolvedVersion)

### Configuration

- [action.yml](../action.yml) - GitHub Action inputs: `sdk-version`, `runtime-version`, `aspnetcore-version`, `global-json`, `cache`, `allow-preview`; outputs: `dotnet-version`, `dotnet-path`, `cache-hit`

## Common Commands

**Critical**: Vite bundles all deps into single `dist/index.js` for GitHub Actions.

```bash
pnpm build    # TypeScript → Vite SSR bundle
pnpm format   # Biome & Prettier auto-fix
pnpm lint     # Biome linting
pnpm knip     # Dependency analysis with Knip
pnpm test     # Run tests with Vitest
pnpm validate # Runs all commands
```

Always run `pnpm validate` in the end for a full check.

## Testing

- **Framework**: Vitest for unit tests
- **Required**: Write tests for every module and function
- **Location**: Tests in `*.test.ts` files alongside source files (e.g., `version-resolver.test.ts` next to `version-resolver.ts`)
- **Focus**: Keep tests simple and focused on essential behavior
- **Coverage**: Test happy paths, edge cases, and error handling
- **Mocking**: Mock external dependencies (@actions/\*, fetch, etc.) using `globalThis` for global APIs
- **Cleanup**: Always use `afterEach` to clean up test artifacts (temp files, directories)

Example test structure:

```typescript
import { describe, it, expect } from 'vitest';
import { functionName } from './module';

describe('functionName', () => {
  it('should handle basic case', () => {
    expect(functionName('input')).toBe('expected');
  });
});
```

## Code Style

- **Tabs** (not spaces), **single quotes**, LF line endings
- **Variable names must always be written out in full** - no abbreviations (e.g., `versionNumber` not `versionNum`, `installationDirectory` not `instDir`, `platform` not `plat`)
- **Type definitions**: Place related types in `<module>.types.ts` files alongside their modules (e.g., types used by `installer.ts` go in `installer.types.ts`, types for `global-json-reader.ts` go in `global-json.types.ts`)
- Biome auto-organizes imports on save
- Write clean, modular, maintainable code
- **Never use `any` or `unknown`** - always provide explicit types
- **Avoid over-commenting** - code should be self-explanatory; use comments only when explaining "why", not "what"
- Keep functions focused and single-purpose
- Prefer early returns over nested conditions

## Logging & Debugging

- Use `core.info()` for user-visible messages
- Use `core.debug()` for troubleshooting, but keep it **focused and actionable**
- Log at key points: function entry, before/after async operations, API calls, cache operations
- **Avoid excessive debug logging** - too many debug statements make logs hard to read
- Focus on values that help diagnose issues (inputs, outputs, decisions)
- Prefer concise debug messages: `Resolved x.x.x -> 10.0.100` instead of multiple separate logs

## Documentation Guidelines

When writing documentation:

- **Simple and Clear**: Use straightforward language that's easy to understand. Avoid jargon unless necessary; if used, explain it.
- **Precise**: Be exact and concise. Remove unnecessary words and focus on essential information.
- **Realistic Examples**: All code examples and use cases should reflect real-world scenarios, not contrived edge cases.
- **Clear Structure**:
  - Start with a brief overview of what the section covers
  - Use headings, bullet points, and code blocks for readability
  - Follow a logical flow: concept → explanation → example → expected behavior
  - Keep related information grouped together

## Error Handling

- **GitHub Actions errors**: Use `core.setFailed(error.message)` at the top level to fail the action with a descriptive message
- **Throwing errors**: Throw descriptive `Error` objects with clear messages explaining what went wrong and why
- **Error context**: Include relevant context in error messages (e.g., file paths, version numbers, platform details)
- **Type checking**: Always check `error instanceof Error` before accessing `error.message`
- **Fallback**: Provide fallback error messages for unknown errors: `'An unknown error occurred'`
- **Early validation**: Validate inputs and preconditions early, throw errors immediately if invalid
- **No silent failures**: Never catch and ignore errors - either handle them properly or let them propagate

Example error handling pattern:

```typescript
try {
  const result = await someOperation();
  return result;
} catch (error) {
  if (error instanceof Error) {
    core.setFailed(error.message);
  } else {
    core.setFailed('An unknown error occurred');
  }
}
```

## Security Considerations

- **File integrity**: Always validate downloaded file hashes using SHA-512 before extraction
- **Hash verification**: Use `crypto.createHash('sha512')` for file validation, compare with official .NET release manifests
- **Cryptographic operations**: Use Node's built-in `crypto` module for all hashing operations
- **No hardcoded secrets**: Never commit API keys, tokens, or sensitive data - use GitHub Actions secrets
- **Dependency security**: Keep dependencies updated, review security advisories via Renovate
- **Input validation**: Validate and sanitize all user inputs before use
- **Path traversal**: Use `path.join()` to safely construct file paths, never concatenate strings
- **Minimal permissions**: Request only necessary GitHub Actions permissions in workflows

## Performance Considerations

- **Parallel downloads**: Use `Promise.all()` to download multiple .NET versions concurrently
- **Caching strategy**: Implement unified caching with a single cache entry per run (keyed by platform, architecture, and version hash)
- **Smart deduplication**: Skip redundant runtime installations when already included in SDK (use SDK-to-runtime mapping)
- **Conditional installation**: Check if versions are already installed before downloading (system-wide or in tool cache)
- **Vite bundling**: All dependencies are bundled into a single `dist/index.js` file to minimize startup overhead
- **Avoid excessive I/O**: Minimize file system operations, cache results when possible
- **Efficient logging**: Use `core.debug()` for verbose output, `core.info()` for essential messages
- **Stream processing**: Process large files in chunks when possible to reduce memory usage

## CI/CD

### Continuous Integration

The CI workflow (`.github/workflows/ci.yml`) runs on every pull request:

1. **Format check**: `pnpm format:ci` - Validates code formatting (Prettier + Biome)
2. **Lint check**: `pnpm lint:ci` - Checks code quality and style violations
3. **Dependency analysis**: `pnpm knip` - Detects unused dependencies and exports
4. **Tests**: `pnpm test` - Runs all Vitest unit tests
5. **Build**: `pnpm build` - Compiles TypeScript and bundles with Vite

All checks must pass before merging.

### Release Process

- **Tagging**: Create a version tag (e.g., `v1.5.0`) to trigger a release
- **Major tag**: The release workflow automatically updates/creates a major version tag (e.g., `v1`) pointing to the latest release
- **dist/ directory**: Always commit the built `dist/index.js` file with code changes (required for GitHub Actions)

### Other Workflows

- **rebuild-dist.yml**: Automatically rebuilds `dist/` if changes are detected but not committed
- **test-action.yml**: Integration tests that run the action with various configurations
- **benchmark.yml**: Performance benchmarks comparing against the official action
- **renovate-validation.yml**: Validates Renovate configuration

## Dependencies

### Production Dependencies

All production dependencies are from the official `@actions/*` organization:

- `@actions/cache` - GitHub Actions cache integration
- `@actions/core` - Core GitHub Actions functionality (inputs, outputs, logging)
- `@actions/exec` - Execute commands
- `@actions/io` - File system operations
- `@actions/tool-cache` - Tool installation and caching
- `jsonc-parser` - Parse JSON with comments (for `global.json`)

### Development Dependencies

- **Biome**: Fast linter and formatter (replaces ESLint/Prettier for code)
- **Prettier**: Additional formatting for Markdown and JSON
- **Vite**: Bundler for creating single-file output (`dist/index.js`)
- **Vitest**: Test framework
- **TypeScript**: Type checking and compilation
- **Knip**: Finds unused dependencies and exports

### Adding Dependencies

- **Minimize additions**: Only add dependencies when absolutely necessary
- **Prefer `@actions/*`**: Use official GitHub Actions packages when available
- **Bundle size matters**: Remember all deps are bundled into `dist/index.js` - keep it lean
- **Security review**: Check for known vulnerabilities before adding
- **Renovate**: Dependencies are auto-updated via Renovate - review and test updates promptly

### Updating Dependencies

Run `pnpm update` to update dependencies, then:

1. Run `pnpm validate` to ensure everything works
2. Check `dist/index.js` size - significant increases need investigation
3. Test the action with integration tests
4. Commit both `package.json`, `pnpm-lock.yaml`, and updated `dist/index.js`
