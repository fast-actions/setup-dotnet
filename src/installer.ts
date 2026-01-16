import * as core from "@actions/core";
import * as exec from "@actions/exec";

export interface DotNetInstallOptions {
	version: string;
	runtimeOnly: boolean;
	architecture: string;
	quality: string;
}

/**
 * Install .NET SDK or Runtime
 */
export async function installDotNet(
	options: DotNetInstallOptions,
): Promise<string> {
	core.info(`Installing .NET ${options.version}...`);

	// TODO: Implement download logic
	// 1. Determine download URL based on version, architecture, OS
	// 2. Download .NET installer using tool-cache
	// 3. Extract/Install .NET
	// 4. Add to PATH
	// 5. Verify installation

	throw new Error("Not implemented yet");
}

/**
 * Get the download URL for .NET
 */
export function getDotNetDownloadUrl(
	version: string,
	architecture: string,
	platform: string,
	runtimeOnly: boolean,
): string {
	// TODO: Build download URL from .NET download API
	// Example: https://dotnetcli.azureedge.net/dotnet/Sdk/{version}/dotnet-sdk-{version}-{platform}-{arch}.{ext}

	throw new Error("Not implemented yet");
}

/**
 * Verify .NET installation
 */
export async function verifyDotNetInstallation(
	dotnetPath: string,
): Promise<boolean> {
	try {
		// TODO: Run `dotnet --version` to verify
		const exitCode = await exec.exec("dotnet", ["--version"], {
			silent: true,
		});

		return exitCode === 0;
	} catch (error) {
		return false;
	}
}
