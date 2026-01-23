import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type { DotnetType } from '../types';

export interface InstalledVersions {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
}

/**
 * Parse output from `dotnet --list-sdks` or `dotnet --list-runtimes`
 * Expected format:
 *   8.0.100 [/usr/share/dotnet/sdk]
 *   9.0.100 [/usr/share/dotnet/sdk]
 */
function parseVersionList(output: string): string[] {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			// Extract version from "version [path]" format
			const match = line.match(/^([\d.]+(?:-[a-zA-Z0-9.-]+)?)\s*\[/);
			return match ? match[1] : null;
		})
		.filter((version): version is string => version !== null);
}

/**
 * Execute dotnet command and capture output
 */
async function executeDotnetCommand(args: string[]): Promise<string> {
	let output = '';
	let errorOutput = '';

	const options: exec.ExecOptions = {
		silent: true,
		ignoreReturnCode: true,
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				errorOutput += data.toString();
			},
		},
	};

	const exitCode = await exec.exec('dotnet', args, options);

	if (exitCode !== 0) {
		core.debug(`dotnet ${args.join(' ')} failed with exit code ${exitCode}`);
		if (errorOutput) {
			core.debug(`Error output: ${errorOutput}`);
		}
		return '';
	}

	return output;
}

/**
 * Get list of installed .NET SDKs on the system
 */
async function getInstalledSdks(): Promise<string[]> {
	core.debug('Checking for pre-installed SDKs...');
	const output = await executeDotnetCommand(['--list-sdks']);
	const versions = parseVersionList(output);
	if (versions.length > 0) {
		core.debug(
			`Found ${versions.length} pre-installed SDK(s): ${versions.join(', ')}`,
		);
	} else {
		core.debug('No pre-installed SDKs found');
	}
	return versions;
}

/**
 * Get list of installed .NET Runtimes on the system
 */
async function getInstalledRuntimes(): Promise<string[]> {
	core.debug('Checking for pre-installed Runtimes...');
	const output = await executeDotnetCommand(['--list-runtimes']);
	const lines = output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const runtimes: string[] = [];

	for (const line of lines) {
		// Format: "Microsoft.NETCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]"
		const match = line.match(
			/^Microsoft\.NETCore\.App\s+([\d.]+(?:-[a-zA-Z0-9.-]+)?)\s*\[/,
		);
		if (match) {
			runtimes.push(match[1]);
		}
	}

	if (runtimes.length > 0) {
		core.debug(
			`Found ${runtimes.length} pre-installed Runtime(s): ${runtimes.join(', ')}`,
		);
	} else {
		core.debug('No pre-installed Runtimes found');
	}
	return runtimes;
}

/**
 * Get list of installed ASP.NET Core Runtimes on the system
 */
async function getInstalledAspNetCoreRuntimes(): Promise<string[]> {
	core.debug('Checking for pre-installed ASP.NET Core Runtimes...');
	const output = await executeDotnetCommand(['--list-runtimes']);
	const lines = output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	const aspnetcoreRuntimes: string[] = [];

	for (const line of lines) {
		// Format: "Microsoft.AspNetCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]"
		const match = line.match(
			/^Microsoft\.AspNetCore\.App\s+([\d.]+(?:-[a-zA-Z0-9.-]+)?)\s*\[/,
		);
		if (match) {
			aspnetcoreRuntimes.push(match[1]);
		}
	}

	if (aspnetcoreRuntimes.length > 0) {
		core.info(
			`Found ${aspnetcoreRuntimes.length} pre-installed ASP.NET Core Runtime(s): ${aspnetcoreRuntimes.join(', ')}`,
		);
	} else {
		core.info('No pre-installed ASP.NET Core Runtimes found');
	}
	return aspnetcoreRuntimes;
}

/**
 * Get all installed .NET versions on the system
 */
export async function getInstalledVersions(): Promise<InstalledVersions> {
	try {
		const [sdk, runtime, aspnetcore] = await Promise.all([
			getInstalledSdks(),
			getInstalledRuntimes(),
			getInstalledAspNetCoreRuntimes(),
		]);

		return { sdk, runtime, aspnetcore };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.debug(`Error detecting installed versions: ${errorMessage}`);
		// Return empty arrays if detection fails - we'll just install everything
		return { sdk: [], runtime: [], aspnetcore: [] };
	}
}

/**
 * Check if a specific version is already installed
 */
export function isVersionInstalled(
	version: string,
	type: DotnetType,
	installed: InstalledVersions,
): boolean {
	const installedList =
		type === 'sdk'
			? installed.sdk
			: type === 'runtime'
				? installed.runtime
				: installed.aspnetcore;

	return installedList.includes(version);
}
