import * as core from '@actions/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseJson } from 'jsonc-parser';

interface GlobalJson {
	sdk?: {
		version?: string;
		rollForward?: string;
		allowPrerelease?: boolean;
	};
}

/**
 * Read and parse global.json file
 */
export async function readGlobalJson(filePath: string): Promise<string | null> {
	try {
		core.debug(`Attempting to read global.json from: ${filePath}`);
		const content = await fs.readFile(filePath, 'utf-8');
		core.debug(`Successfully read global.json (${content.length} bytes)`);

		let parsed: GlobalJson;
		try {
			parsed = parseJson(content) as GlobalJson;

			// jsonc-parser returns undefined for invalid JSON instead of throwing
			if (parsed === undefined) {
				throw new Error('Unable to parse JSON content');
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			throw new Error(`Invalid JSON in global.json: ${errorMsg}`);
		}

		if (!parsed.sdk) {
			core.debug('No sdk section found in global.json');
			return null;
		}

		const version = parsed.sdk?.version;
		const rollForward = parsed.sdk?.rollForward;

		// If version was missing, return x.x.x directly without validation
		if (!version) {
			core.debug(
				'SDK version missing in global.json, resolving to x.x.x (latest)',
			);
			return 'x.x.x';
		}

		// Validate version format - must be full version number (e.g., 10.0.100)
		// Wildcards are not supported in global.json per official spec
		if (version.includes('x') || version.includes('*')) {
			throw new Error(
				`Invalid version in global.json: '${version}'. Wildcards are not supported. Use a full version number (e.g., 10.0.100) with rollForward policy instead.`,
			);
		}

		// Check if this is a preview version using semver prerelease pattern
		// Pattern: major.minor.patch-prerelease (e.g., 9.0.100-preview.7.24407.12)
		const semverPattern = /^(\d+\.\d+\.\d+)(-[a-zA-Z0-9.-]+)?$/;
		const match = version.match(semverPattern);

		if (!match) {
			throw new Error(
				`Invalid version format in global.json: '${version}'. Expected format: major.minor.patch (e.g., 10.0.100) or major.minor.patch-prerelease (e.g., 9.0.100-preview.7)`,
			);
		}

		core.debug(`SDK version from global.json: ${version}`);
		if (rollForward) {
			core.debug(`rollForward policy: ${rollForward}`);
		}

		// Apply rollForward policy by converting to wildcards
		const resolvedVersion = applyRollForward(version, rollForward);
		if (resolvedVersion !== version) {
			core.debug(
				`Applied rollForward policy '${rollForward}': ${version} -> ${resolvedVersion}`,
			);
		}

		return resolvedVersion;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			core.debug(`global.json not found at: ${filePath}`);
			return null;
		}
		throw error;
	}
}

/**
 * Apply rollForward policy to SDK version
 *
 * In official .NET SDK behavior, rollForward policies select from installed SDKs.
 * In our GitHub Action context, we're downloading SDKs, so we transform the version
 * into a wildcard pattern that our version-resolver can use to find the latest matching version.
 *
 * This approach is semantically equivalent for CI/CD: instead of "pick from installed",
 * we "download the latest matching".
 */
function applyRollForward(version: string, rollForward?: string): string {
	// Default behavior (no rollForward specified) or explicit disable: use exact version
	if (!rollForward || rollForward === 'disable') {
		return version;
	}

	const parts = version.split('.');

	switch (rollForward) {
		case 'patch':
		// Official: Roll forward to latest patch within same feature band
		// Our implementation: Download latest patch in same major.minor (8.0.100 -> 8.0.x)
		// Note: patch and latestPatch behave similarly in download context
		case 'latestPatch':
			// Official: Use highest installed patch >= specified value
			// Our implementation: Download latest patch in same major.minor (8.0.100 -> 8.0.x)
			return `${parts[0]}.${parts[1]}.x`;

		case 'feature':
		// Official: Roll forward to next feature band within same major.minor if needed
		// Our implementation: Download latest in same major.minor (8.0.100 -> 8.0.x)
		// Note: In download context, this gets the latest feature band automatically
		case 'latestFeature':
			// Official: Use highest feature band >= specified value within same major.minor
			// Our implementation: Download latest in same major.minor (8.0.100 -> 8.0.x)
			return `${parts[0]}.${parts[1]}.x`;

		case 'minor':
		// Official: Roll forward to next minor version if needed
		// Our implementation: Download latest minor in same major (8.0.100 -> 8.x.x)
		case 'latestMinor':
			// Official: Use highest minor >= specified value within same major
			// Our implementation: Download latest minor in same major (8.0.100 -> 8.x.x)
			return `${parts[0]}.x.x`;

		case 'major':
		// Official: Roll forward to next major version if needed
		// Our implementation: Download latest major (8.0.100 -> x.x.x)
		case 'latestMajor':
			// Official: Use highest major >= specified value
			// Our implementation: Download latest major (8.0.100 -> x.x.x)
			return 'x.x.x';

		default:
			core.warning(
				`Unknown rollForward policy '${rollForward}', using exact version`,
			);
			return version;
	}
}

/**
 * Get the default global.json path in the workspace
 */
export function getDefaultGlobalJsonPath(): string {
	const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
	return path.join(workspaceRoot, 'global.json');
}
