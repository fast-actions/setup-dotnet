import * as core from '@actions/core';
import * as exec from '@actions/exec';
import type { DotnetType, VersionSet } from '../types';

const VERSION_PATTERN = String.raw`([\d.]+(?:-[a-zA-Z0-9.-]+)?)\s*\[`;

// `dotnet --list-sdks` prints "8.0.100 [/usr/share/dotnet/sdk]"
const SDK_LINE_PATTERN = new RegExp(`^${VERSION_PATTERN}`);

// `dotnet --list-runtimes` prints "Microsoft.NETCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]"
const RUNTIME_LINE_PATTERN = new RegExp(
	String.raw`^Microsoft\.NETCore\.App\s+${VERSION_PATTERN}`,
);
const ASPNETCORE_LINE_PATTERN = new RegExp(
	String.raw`^Microsoft\.AspNetCore\.App\s+${VERSION_PATTERN}`,
);

function parseVersionList(output: string, linePattern: RegExp): string[] {
	return output
		.split('\n')
		.map((line) => linePattern.exec(line.trim())?.[1])
		.filter((version): version is string => version !== undefined);
}

async function executeDotnetCommand(
	args: string[],
	dotnetPath?: string,
): Promise<string> {
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

	const command = dotnetPath || 'dotnet';
	const exitCode = await exec.exec(command, args, options);

	if (exitCode !== 0) {
		core.debug(
			`${command} ${args.join(' ')} failed with exit code ${exitCode}`,
		);
		if (errorOutput) {
			core.debug(`Error output: ${errorOutput}`);
		}
		return '';
	}

	return output;
}

function logDetectedVersions(label: string, versions: string[]): void {
	if (versions.length === 0) {
		core.debug(`No pre-installed ${label}s found`);
		return;
	}
	core.debug(
		`Found ${versions.length} pre-installed ${label}(s): ${versions.join(', ')}`,
	);
}

export async function getInstalledVersions(
	dotnetPath?: string,
): Promise<VersionSet> {
	try {
		const [sdkOutput, runtimeOutput] = await Promise.all([
			executeDotnetCommand(['--list-sdks'], dotnetPath),
			executeDotnetCommand(['--list-runtimes'], dotnetPath),
		]);

		const installed: VersionSet = {
			sdk: parseVersionList(sdkOutput, SDK_LINE_PATTERN),
			runtime: parseVersionList(runtimeOutput, RUNTIME_LINE_PATTERN),
			aspnetcore: parseVersionList(runtimeOutput, ASPNETCORE_LINE_PATTERN),
		};

		logDetectedVersions('SDK', installed.sdk);
		logDetectedVersions('Runtime', installed.runtime);
		logDetectedVersions('ASP.NET Core Runtime', installed.aspnetcore);

		return installed;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		core.debug(`Error detecting installed versions: ${errorMessage}`);
		// Return empty arrays if detection fails - we'll just install everything
		return { sdk: [], runtime: [], aspnetcore: [] };
	}
}

export function isVersionInstalled(
	version: string,
	type: DotnetType,
	installed: VersionSet,
): boolean {
	return installed[type].includes(version);
}
