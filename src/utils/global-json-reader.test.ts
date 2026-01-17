import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDefaultGlobalJsonPath, readGlobalJson } from './global-json-reader';

describe('readGlobalJson', () => {
	const testDir = path.join(__dirname, '__test_global_json__');
	const testFile = path.join(testDir, 'global.json');

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it('should read valid global.json with SDK version', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.100');
	});

	it('should apply rollForward: patch policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'patch',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.x');
	});

	it('should apply rollForward: latestPatch policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'latestPatch',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.x');
	});

	it('should apply rollForward: feature policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'feature',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.x');
	});

	it('should apply rollForward: latestFeature policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'latestFeature',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.x');
	});

	it('should apply rollForward: minor policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'minor',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.x.x');
	});

	it('should apply rollForward: latestMinor policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'latestMinor',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.x.x');
	});

	it('should apply rollForward: major policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'major',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('x.x.x');
	});

	it('should apply rollForward: latestMajor policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'latestMajor',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('x.x.x');
	});

	it('should not apply rollForward: disable policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'disable',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.100');
	});

	it('should handle unknown rollForward policy', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				rollForward: 'unknown',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.100');
	});

	it('should return null for missing file', async () => {
		const version = await readGlobalJson(
			path.join(testDir, 'nonexistent.json'),
		);
		expect(version).toBeNull();
	});

	it('should throw error for invalid JSON', async () => {
		await fs.writeFile(testFile, 'invalid json', 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			'Invalid JSON in global.json',
		);
	});

	it('should return null for missing sdk.version', async () => {
		const content = JSON.stringify({
			sdk: {},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBeNull();
	});

	it('should return null for missing sdk section', async () => {
		const content = JSON.stringify({
			msbuild: {
				version: '1.0.0',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBeNull();
	});

	it('should reject wildcard versions in global.json', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.x',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Invalid version in global.json: '8.0.x'. Wildcards are not supported",
		);
	});

	it('should reject asterisk wildcards in global.json', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.*',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Invalid version in global.json: '8.0.*'. Wildcards are not supported",
		);
	});

	it('should reject invalid version formats', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Invalid version format in global.json: '8.0'",
		);
	});

	it('should reject non-numeric version parts', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.abc',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Invalid version format in global.json: '8.0.abc'",
		);
	});

	it('should reject version with spaces', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100 preview',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Invalid version format in global.json: '8.0.100 preview'",
		);
	});

	it('should handle allowPrerelease flag with stable version', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '8.0.100',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('8.0.100');
	});

	it('should accept preview version when allowPrerelease is true', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.100-preview.7',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('9.0.100-preview.7');
	});

	it('should accept preview version with complex prerelease suffix', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.100-preview.7.24407.12',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('9.0.100-preview.7.24407.12');
	});

	it('should reject preview version when allowPrerelease is false', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.100-preview.7',
				allowPrerelease: false,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Preview version '9.0.100-preview.7' specified in global.json, but 'allowPrerelease' is not set to true",
		);
	});

	it('should reject preview version when allowPrerelease is not specified', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.100-preview.7',
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		await expect(readGlobalJson(testFile)).rejects.toThrow(
			"Preview version '9.0.100-preview.7' specified in global.json, but 'allowPrerelease' is not set to true",
		);
	});

	it('should accept rc versions when allowPrerelease is true', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.100-rc.2',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('9.0.100-rc.2');
	});

	it('should accept alpha/beta versions when allowPrerelease is true', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.100-alpha.1',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('9.0.100-alpha.1');
	});

	it('should apply rollForward: latestMajor with allowPrerelease flag', async () => {
		const content = JSON.stringify({
			sdk: {
				version: '9.0.0',
				rollForward: 'latestMajor',
				allowPrerelease: true,
			},
		});
		await fs.writeFile(testFile, content, 'utf-8');

		const version = await readGlobalJson(testFile);
		expect(version).toBe('x.x.x');
	});
});

describe('getDefaultGlobalJsonPath', () => {
	const originalWorkspace = process.env.GITHUB_WORKSPACE;

	afterEach(() => {
		// Restore original environment after each test
		if (originalWorkspace) {
			process.env.GITHUB_WORKSPACE = originalWorkspace;
		} else {
			delete process.env.GITHUB_WORKSPACE;
		}
	});

	it('should return path in GITHUB_WORKSPACE if set', () => {
		process.env.GITHUB_WORKSPACE = '/github/workspace';

		const result = getDefaultGlobalJsonPath();
		expect(result).toBe('/github/workspace/global.json');
	});

	it('should return path in cwd if GITHUB_WORKSPACE not set', () => {
		delete process.env.GITHUB_WORKSPACE;

		const result = getDefaultGlobalJsonPath();
		expect(result).toBe(path.join(process.cwd(), 'global.json'));
	});
});
