import * as core from '@actions/core';
import type { DotnetType, InstallResult, VersionSet } from '../types';

interface InstallationsBySource {
	alreadyInstalled: InstallResult[];
	githubCache: InstallResult[];
	downloaded: InstallResult[];
}

const TYPE_LABELS: Record<DotnetType, string> = {
	sdk: 'SDK',
	runtime: 'Runtime',
	aspnetcore: 'ASP.NET Core',
};

const TYPE_ORDER: DotnetType[] = ['sdk', 'runtime', 'aspnetcore'];

export function formatVersionPlan(deduplicated: VersionSet): string {
	return TYPE_ORDER.filter((type) => deduplicated[type].length > 0)
		.map((type) => `${TYPE_LABELS[type]} ${deduplicated[type].join(', ')}`)
		.join(' | ');
}

export function setActionOutputs(
	versions: string,
	installDirectory: string,
	cacheHit: boolean,
): void {
	core.setOutput('dotnet-version', versions);
	core.setOutput('dotnet-path', installDirectory);
	core.setOutput('cache-hit', cacheHit);
}

export function groupInstallationsBySource(
	results: InstallResult[],
): InstallationsBySource {
	return {
		alreadyInstalled: results.filter(
			(result) => result.source === 'installation-directory',
		),
		githubCache: results.filter((result) => result.source === 'github-cache'),
		downloaded: results.filter((result) => result.source === 'download'),
	};
}

function formatVersionsList(results: InstallResult[]): string {
	return [...results]
		.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
		.map((result) => `${TYPE_LABELS[result.type]} ${result.version}`)
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
