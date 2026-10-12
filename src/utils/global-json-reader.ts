import * as core from '@actions/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse as parseJson } from 'jsonc-parser';
import type { GlobalJson, SdkInfo } from '../types';

// major.minor.patch with optional prerelease, e.g. 9.0.100-preview.7.24407.12
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;

export async function readGlobalJson(
	filePath: string,
): Promise<SdkInfo | null> {
	try {
		core.debug(`Attempting to read global.json from: ${filePath}`);
		const content = await fs.readFile(filePath, 'utf-8');
		core.debug(`Successfully read global.json (${content.length} bytes)`);

		// jsonc-parser returns undefined for invalid JSON instead of throwing
		const parsed = parseJson(content) as GlobalJson | undefined;
		if (parsed === undefined) {
			throw new Error(
				'Invalid JSON in global.json: Unable to parse JSON content',
			);
		}

		if (!parsed.sdk) {
			core.debug('No sdk section found in global.json');
			return null;
		}

		const { version, rollForward } = parsed.sdk;
		const allowPrerelease = parsed.sdk.allowPrerelease ?? false;

		// If version was missing, return latest directly without validation
		if (!version) {
			core.debug('SDK version missing in global.json, resolving to latest');
			return { version: 'latest', allowPrerelease };
		}

		// Wildcards are not supported in global.json per official spec
		if (version.includes('x') || version.includes('*')) {
			throw new Error(
				`Invalid version in global.json: '${version}'. Wildcards are not supported. Use a full version number (e.g., 10.0.100) with rollForward policy instead.`,
			);
		}

		if (!SEMVER_PATTERN.test(version)) {
			throw new Error(
				`Invalid version format in global.json: '${version}'. Expected format: major.minor.patch (e.g., 10.0.100) or major.minor.patch-prerelease (e.g., 9.0.100-preview.7)`,
			);
		}

		core.debug(`SDK version from global.json: ${version}`);
		if (rollForward) {
			core.debug(`rollForward policy: ${rollForward}`);
		}

		const resolvedVersion = applyRollForward(version, rollForward);
		if (resolvedVersion !== version) {
			core.debug(
				`Applied rollForward policy '${rollForward}': ${version} -> ${resolvedVersion}`,
			);
		}

		return { version: resolvedVersion, allowPrerelease };
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			core.debug(`global.json not found at: ${filePath}`);
			return null;
		}
		throw error;
	}
}

// The .NET SDK applies rollForward to the SDKs installed on the machine. This
// action downloads SDKs instead, so the policy becomes a wildcard pattern that
// resolves to the latest matching release (e.g. 'patch': 8.0.100 -> 8.0.x).
// The "latest*" variants behave the same as their base policy in this context.
function applyRollForward(version: string, rollForward?: string): string {
	if (!rollForward || rollForward === 'disable') {
		return version;
	}

	const [major, minor] = version.split('.');

	switch (rollForward) {
		case 'patch':
		case 'latestPatch':
		case 'feature':
		case 'latestFeature':
			return `${major}.${minor}.x`;
		case 'minor':
		case 'latestMinor':
			return `${major}.x.x`;
		case 'major':
		case 'latestMajor':
			return 'latest';
		default:
			core.warning(
				`Unknown rollForward policy '${rollForward}', using exact version`,
			);
			return version;
	}
}

export function getDefaultGlobalJsonPath(): string {
	const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
	return path.join(workspaceRoot, 'global.json');
}
