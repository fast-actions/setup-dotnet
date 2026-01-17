# Sample global.json Files

This directory contains sample `global.json` files for testing different scenarios:

- **global.json.exact** - Exact SDK version (10.0.100)
- **global.json.patch** - With `latestPatch` rollForward policy (9.0.100 → latest 9.0.x patch)
- **global.json.feature** - With `latestFeature` rollForward policy (8.0.100 → latest 8.0.x feature band)
- **global.json.minor** - With `latestMinor` rollForward policy (8.0.100 → latest 8.x.x)

## Usage in Tests

These files are used in the GitHub Actions workflow to verify that the action correctly:
- Reads `global.json` files
- Applies rollForward policies
- Installs the correct SDK versions
- Allows runtime installations independently of global.json
