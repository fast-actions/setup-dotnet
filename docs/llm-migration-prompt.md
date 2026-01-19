# LLM Migration Prompt

Copy-paste this prompt to your AI assistant to migrate your GitHub Actions workflows:

---

```
Migrate my GitHub Actions workflows from actions/setup-dotnet to fast-actions/setup-dotnet@v1.

Key changes to apply:
1. Replace "actions/setup-dotnet@v4" with "fast-actions/setup-dotnet@v1"
2. Rename parameter "dotnet-version" to "sdk-version"
3. If installing multiple SDKs where some are only needed for runtime, split into sdk-version (for development) and runtime-version (for running apps)

Example transformation:

Before:
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: |
      10.x
      9.x

After:
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 10.x.x
    runtime-version: 9.x.x

global.json support remains unchanged - just update the action name and parameters.

Please update all workflow files in .github/workflows/ directory.
```
