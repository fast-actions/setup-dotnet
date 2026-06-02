import * as core from '@actions/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallResult, VersionSet } from '../types';
import {
	formatVersionPlan,
	groupInstallationsBySource,
	logInstallationsBySource,
	setActionOutputs,
} from './output-formatter';

vi.mock('@actions/core');

function makeResult(
	type: InstallResult['type'],
	version: string,
	source: InstallResult['source'],
): InstallResult {
	return { type, version, source, path: '/path/to/dotnet' };
}

describe('formatVersionPlan', () => {
	it('should return an empty string when nothing is requested', () => {
		const empty: VersionSet = { sdk: [], runtime: [], aspnetcore: [] };
		expect(formatVersionPlan(empty)).toBe('');
	});

	it('should format a single type', () => {
		const plan: VersionSet = {
			sdk: ['10.0.100'],
			runtime: [],
			aspnetcore: [],
		};
		expect(formatVersionPlan(plan)).toBe('SDK 10.0.100');
	});

	it('should format all types joined with a separator', () => {
		const plan: VersionSet = {
			sdk: ['10.0.100', '9.0.100'],
			runtime: ['9.0.5'],
			aspnetcore: ['8.0.0'],
		};
		expect(formatVersionPlan(plan)).toBe(
			'SDK 10.0.100, 9.0.100 | Runtime 9.0.5 | ASP.NET Core 8.0.0',
		);
	});
});

describe('setActionOutputs', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should set all action outputs', () => {
		setActionOutputs('sdk:10.0.100', '/path/to/dotnet', true);

		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-version',
			'sdk:10.0.100',
		);
		expect(core.setOutput).toHaveBeenCalledWith(
			'dotnet-path',
			'/path/to/dotnet',
		);
		expect(core.setOutput).toHaveBeenCalledWith('cache-hit', true);
	});
});

describe('groupInstallationsBySource', () => {
	it('should group results by their installation source', () => {
		const results: InstallResult[] = [
			makeResult('sdk', '10.0.100', 'installation-directory'),
			makeResult('runtime', '9.0.5', 'github-cache'),
			makeResult('aspnetcore', '8.0.0', 'download'),
			makeResult('runtime', '8.0.5', 'download'),
		];

		const grouped = groupInstallationsBySource(results);

		expect(grouped.alreadyInstalled).toEqual([results[0]]);
		expect(grouped.githubCache).toEqual([results[1]]);
		expect(grouped.downloaded).toEqual([results[2], results[3]]);
	});

	it('should return empty groups for an empty input', () => {
		const grouped = groupInstallationsBySource([]);
		expect(grouped.alreadyInstalled).toEqual([]);
		expect(grouped.githubCache).toEqual([]);
		expect(grouped.downloaded).toEqual([]);
	});
});

describe('logInstallationsBySource', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should log only non-empty groups, sorted by type', () => {
		logInstallationsBySource({
			alreadyInstalled: [],
			githubCache: [makeResult('runtime', '9.0.5', 'github-cache')],
			downloaded: [
				makeResult('runtime', '8.0.5', 'download'),
				makeResult('sdk', '10.0.100', 'download'),
			],
		});

		expect(core.info).toHaveBeenCalledTimes(2);
		expect(core.info).toHaveBeenCalledWith(
			'Restored from cache: Runtime 9.0.5',
		);
		expect(core.info).toHaveBeenCalledWith(
			'Downloaded: SDK 10.0.100 | Runtime 8.0.5',
		);
	});

	it('should not log anything when all groups are empty', () => {
		logInstallationsBySource({
			alreadyInstalled: [],
			githubCache: [],
			downloaded: [],
		});

		expect(core.info).not.toHaveBeenCalled();
	});
});
