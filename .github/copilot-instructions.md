# Copilot Instructions for fast-actions/setup-dotnet

## Project Overview
GitHub Action for .NET SDK/Runtime installation with caching. TypeScript + Vite + Biome. This is a custom action published as `fast-actions/setup-dotnet`. This is NOT the official `actions/setup-dotnet` GitHub Action and we don't want to use the official Action.

## Architecture
- [src/main.ts](../src/main.ts) - Entry point, orchestrates installer and global.json reading
- [src/installer.ts](../src/installer.ts) - .NET download/installation via `@actions/tool-cache`
- [src/types.ts](../src/types.ts) - Shared type definitions
- [src/utils/global-json-reader.ts](../src/utils/global-json-reader.ts) - Reads and parses global.json for SDK version resolution
- [src/utils/input-parser.ts](../src/utils/input-parser.ts) - Parses version inputs (comma-separated, multiline)
- [src/utils/platform-utils.ts](../src/utils/platform-utils.ts) - Platform and architecture detection
- [src/utils/archive-utils.ts](../src/utils/archive-utils.ts) - Archive extraction utilities
- [src/utils/cache-utils.ts](../src/utils/cache-utils.ts) - Cache key generation and cache restore/save operations
- [src/utils/versioning/version-resolver.ts](../src/utils/versioning/version-resolver.ts) - Version wildcard resolution, keyword support (lts, sts, latest), and semver comparison
- [src/utils/versioning/version-deduplicator.ts](../src/utils/versioning/version-deduplicator.ts) - Removes redundant SDK/Runtime installations using SDK/Runtime mapping
- [src/utils/versioning/sdk-runtime-mapper.ts](../src/utils/versioning/sdk-runtime-mapper.ts) - Maps SDK versions to included runtimes to prevent duplicate installations
- [action.yml](../action.yml) - GitHub Action inputs: `sdk-version`, `runtime-version`, `aspnetcore-version`, `global-json`, `cache`, `allow-preview`; outputs: `dotnet-version`, `dotnet-path`, `cache-hit`

## Build System
**Critical**: Vite bundles all deps into single `dist/index.js` for GitHub Actions.
```bash
pnpm build    # TypeScript → Vite SSR bundle
pnpm format   # Biome auto-fix
pnpm lint     # Biome linting
pnpm test     # Run tests with Vitest
pnpm validate # Runs all commands
```

## Testing
- **Framework**: Vitest for unit tests
- **Required**: Write tests for every module and function
- **Location**: Tests in `*.test.ts` files alongside source files (e.g., `version-resolver.test.ts` next to `version-resolver.ts`)
- **Focus**: Keep tests simple and focused on essential behavior
- **Coverage**: Test happy paths, edge cases, and error handling
- **Mocking**: Mock external dependencies (@actions/*, fetch, etc.)
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

## Pull Request Guidelines
**PR Titles** must follow the conventional commits format with prefixes like:
- `feat: add support for ARM64 architecture`
- `ci: update GitHub Actions workflow`

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

Example:
```markdown
## Cache Restoration

The action attempts to restore cached .NET installations to speed up subsequent workflow runs.

**How it works:**
1. Generates a cache key based on platform, architecture, and installed versions
2. Checks if a matching cache entry exists
3. Restores files to the .NET installation directory if found

**Example:**
First run downloads .NET 8.0.0 (≈150 MB). Second run with same version restores from cache in seconds.
```

## Validation Workflow
**Always validate changes before completion** by running the following command: `pnpm validate`.

This ensures code quality and prevents breaking changes.
