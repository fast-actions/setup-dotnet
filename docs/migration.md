# Migration Guide

This guide helps you migrate from the official `actions/setup-dotnet` to `fast-actions/setup-dotnet`.

---

## Quick Migration

### Basic SDK Installation

**Before** (actions/setup-dotnet):
```yaml
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '10.x'
```

**After** (fast-actions/setup-dotnet):
```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: '10.x'
```

**Git diff:**
```diff
-- uses: actions/setup-dotnet@v4
+- uses: fast-actions/setup-dotnet@v1
   with:
-    dotnet-version: '10.x'
+    sdk-version: '10.x'
```

---

### Multiple SDK Versions

**Before** (actions/setup-dotnet):
```yaml
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: |
      10.x
      9.x
```

**After** (fast-actions/setup-dotnet):
```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: |
      10.x.x
      9.x.x
```

**Git diff:**
```diff
-- uses: actions/setup-dotnet@v4
+- uses: fast-actions/setup-dotnet@v1
   with:
-    dotnet-version: |
+    sdk-version: |
      10.x
      9.x
```

---

## Key Differences

### Parameter Names

The most significant change is parameter naming:

| Current Action | Fast Action |
|----------------|-------------|
| `dotnet-version` | `sdk-version`, `runtime-version`, `aspnetcore-version` |

### Specialized Runtime Installation

If you only need the runtime (not the SDK), use the dedicated runtime parameters:

**Before** (actions/setup-dotnet):
```yaml
# Install runtime-only is not directly supported
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '9.x'
```

**After** (fast-actions/setup-dotnet):
```yaml
# Install runtime only (no SDK)
- uses: fast-actions/setup-dotnet@v1
  with:
    runtime-version: '9.x.x'
```

**Git diff:**
```diff
-- uses: actions/setup-dotnet@v4
+- uses: fast-actions/setup-dotnet@v1
   with:
-    dotnet-version: '9.x'
+    runtime-version: '9.x.x'
```

For ASP.NET Core runtime:
```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    aspnetcore-version: '9.x.x'
```

---

## Advanced: Mixed Installation

Install SDK + additional runtime versions:

**Before** (actions/setup-dotnet):
```yaml
- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: |
      10.x
      9.x
      8.x
```

**After** (fast-actions/setup-dotnet):
```yaml
# SDK 10.x + runtimes for 9.x and 8.x
- uses: fast-actions/setup-dotnet@v1
  with:
    sdk-version: 10.x
    runtime-version: |
      9.x
      8.x
```

**Git diff:**
```diff
-- uses: actions/setup-dotnet@v4
+- uses: fast-actions/setup-dotnet@v1
   with:
-    dotnet-version: |
-      10.x
-      9.x
-      8.x
+    sdk-version: 10.x
+    runtime-version: |
+      9.x
+      8.x
```

**Why this is better:**
- Explicit separation between SDK and runtime
- Avoids unnecessary SDK installations
- Faster downloads with smart deduplication

---

## global.json Support

Both actions support `global.json`, the syntax remains the same:

**No changes needed:**
```yaml
- uses: fast-actions/setup-dotnet@v1
  # Reads global.json automatically
```

Or with custom path:
```yaml
- uses: fast-actions/setup-dotnet@v1
  with:
    global-json: 'path/to/global.json'
```

---

## Unsupported Features

The fast action does not support the following features from the current action:

- '`dotnet-quality`' parameter. We will add this in the future.
- Caching NuGet packages. We evaluate if we will add this later.

---

## Rolling Back

If you need to switch back to the official action:

**Quick rollback:**
```diff
-- uses: fast-actions/setup-dotnet@v1
+- uses: actions/setup-dotnet@v4
   with:
-    sdk-version: '10.x.x'
+    dotnet-version: '10.x'
```

**For mixed installations:**
```diff
-- uses: fast-actions/setup-dotnet@v1
+- uses: actions/setup-dotnet@v4
   with:
-    sdk-version: '10.x.x'
-    runtime-version: |
-      9.x.x
-      8.x.x
+    dotnet-version: |
+      10.x
+      9.x
+      8.x
```

Simply revert the action name and parameter changes.

---

## Need Help?

If you encounter any issues during migration, please:
- Check the [Complete Guide](https://github.com/fast-actions/setup-dotnet/blob/main/docs/guide.md) for detailed documentation
- Open an issue on [GitHub](https://github.com/fast-actions/setup-dotnet/issues)
