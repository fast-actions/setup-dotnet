# Copilot Instructions for dotnet-setup-fast

## Project Overview
GitHub Action for .NET SDK/Runtime installation with caching. TypeScript + Vite + Biome.

## Architecture
- [src/main.ts](../src/main.ts) - Entry point, orchestrates installer and cache
- [src/installer.ts](../src/installer.ts) - .NET download/installation via `@actions/tool-cache`
- [src/cache.ts](../src/cache.ts) - Caching layer with `@actions/tool-cache`
- [action.yml](../action.yml) - GitHub Action outputs: `dotnet-version`, `cache-hit`, `dotnet-path`

## Build System
**Critical**: Vite bundles all deps into single `dist/index.js` for GitHub Actions.
```bash
pnpm build   # TypeScript → Vite SSR bundle
pnpm format  # Biome auto-fix
pnpm lint    # Biome linting
```

## Code Style
- **Tabs** (not spaces), **single quotes**, LF line endings
- Biome auto-organizes imports on save
