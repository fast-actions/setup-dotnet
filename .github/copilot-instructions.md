# Copilot Instructions for dotnet-setup-fast

## Project Overview
GitHub Action for .NET SDK/Runtime installation with caching. TypeScript + Vite + Biome. This is NOT the official action/setup-dotnet GitHub Action and we don't want to use this official Action.

## Architecture
- [src/main.ts](../src/main.ts) - Entry point, orchestrates installer and global.json reading
- [src/installer.ts](../src/installer.ts) - .NET download/installation via `@actions/tool-cache`
- [src/utils/global-json-reader.ts](../src/utils/global-json-reader.ts) - Reads and parses global.json for SDK version resolution
- [src/utils/input-parser.ts](../src/utils/input-parser.ts) - Parses version inputs (comma-separated, multiline)
- [src/utils/version-resolver.ts](../src/utils/version-resolver.ts) - Version wildcard resolution and semver comparison
- [src/utils/version-deduplicator.ts](../src/utils/version-deduplicator.ts) - Removes redundant SDK/Runtime installations
- [src/utils/sdk-runtime-mapper.ts](../src/utils/sdk-runtime-mapper.ts) - Maps SDK versions to included runtimes
- [src/utils/platform-utils.ts](../src/utils/platform-utils.ts) - Platform and architecture detection
- [src/utils/archive-utils.ts](../src/utils/archive-utils.ts) - Archive extraction utilities
- [src/utils/cache-utils.ts](../src/utils/cache-utils.ts) - Cache key generation and cache restore/save operations
- [action.yml](../action.yml) - GitHub Action inputs: `dotnet-sdk`, `dotnet-runtime`, `dotnet-aspnetcore`, `global-json`, `cache`; outputs: `dotnet-version`, `dotnet-path`

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

## Validation Workflow
**Always validate changes before completion** by running the following command: `pnpm validate`.

This ensures code quality and prevents breaking changes.
