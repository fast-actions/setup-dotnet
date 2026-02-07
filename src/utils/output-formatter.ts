import * as core from '@actions/core';
import type { DotnetType, InstallResult, VersionSet } from '../types';

interface InstallationsBySource {
	alreadyInstalled: InstallResult[];
	githubCache: InstallResult[];
	downloaded: InstallResult[];
}

function formatTypeLabel(type: DotnetType): string {
	switch (type) {
		case 'sdk':
			return 'SDK';
		case 'runtime':
			return 'Runtime';
		case 'aspnetcore':
			return 'ASP.NET Core';
	}
}

export function formatVersionPlan(deduplicated: VersionSet): string {
	const parts: string[] = [];
	if (deduplicated.sdk.length > 0) {
		parts.push(`SDK ${deduplicated.sdk.join(', ')}`);
	}
	if (deduplicated.runtime.length > 0) {
		parts.push(`Runtime ${deduplicated.runtime.join(', ')}`);
	}
	if (deduplicated.aspnetcore.length > 0) {
		parts.push(`ASP.NET Core ${deduplicated.aspnetcore.join(', ')}`);
	}
	return parts.join(' | ');
}

export function setActionOutputs(
	versions: string,
	installDir: string,
	cacheHit: boolean,
): void {
	core.setOutput('dotnet-version', versions);
	core.setOutput('dotnet-path', installDir);
	core.setOutput('cache-hit', cacheHit);
}

function sortByType(results: InstallResult[]): InstallResult[] {
	const typeOrder: Record<DotnetType, number> = {
		sdk: 0,
		runtime: 1,
		aspnetcore: 2,
	};
	return [...results].sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
}

function formatVersion(type: DotnetType, version: string): string {
	const typeLabel = formatTypeLabel(type);
	return `${typeLabel} ${version}`;
}

export function groupInstallationsBySource(
	results: InstallResult[],
): InstallationsBySource {
	return {
		alreadyInstalled: results.filter(
			(r) => r.source === 'installation-directory',
		),
		githubCache: results.filter((r) => r.source === 'github-cache'),
		downloaded: results.filter((r) => r.source === 'download'),
	};
}

function formatVersionsList(results: InstallResult[]): string {
	return sortByType(results)
		.map((r) => formatVersion(r.type, r.version))
		.join(' | ');
}

export function logInstallationsBySource(grouped: InstallationsBySource): void {
	const sources: Array<[string, InstallResult[]]> = [
		['Already installed', grouped.alreadyInstalled],
		['Restored from cache', grouped.githubCache],
		['Downloaded', grouped.downloaded],
	];

	for (const [label, results] of sources) {
		if (results.length > 0) {
			core.info(`${label}: ${formatVersionsList(results)}`);
		}
	}
}
