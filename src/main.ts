import * as core from '@actions/core';
import { installDotNet } from './installer';

interface InstallationResult {
	version: string;
	type: 'sdk' | 'runtime';
	path: string;
}

/**
 * Main entry point for the GitHub Action
 */
export async function run(): Promise<void> {
	try {
		const sdkVersion = core.getInput('dotnet-sdk');
		const runtimeVersion = core.getInput('dotnet-runtime');

		if (!sdkVersion && !runtimeVersion) {
			throw new Error(
				'At least one of dotnet-sdk or dotnet-runtime must be specified',
			);
		}

		// Show installation plan
		const installPlan: string[] = [];
		if (sdkVersion) installPlan.push(`SDK ${sdkVersion}`);
		if (runtimeVersion) installPlan.push(`Runtime ${runtimeVersion}`);
		core.info(`📦 Installing .NET: ${installPlan.join(', ')}`);

		// Prepare installation tasks
		const installTasks: Promise<InstallationResult>[] = [];

		if (sdkVersion) {
			installTasks.push(
				installDotNet({
					version: sdkVersion,
					type: 'sdk',
				}),
			);
		}

		if (runtimeVersion) {
			installTasks.push(
				installDotNet({
					version: runtimeVersion,
					type: 'runtime',
				}),
			);
		}

		// Install in parallel
		const installations = await Promise.all(installTasks);

		core.info('');

		core.info('');

		// Log results
		core.info('✅ Installation complete:');
		for (const result of installations) {
			const typeLabel = result.type.toUpperCase().padEnd(7);
			core.info(`   ${typeLabel} ${result.version}`);
		}
		core.info(`   Path: ${installations[0].path}`);

		// Set outputs
		const versions = installations
			.map((i) => `${i.type}:${i.version}`)
			.join(', ');
		const paths = installations.map((i) => i.path).join(':');

		core.setOutput('dotnet-version', versions);
		core.setOutput('dotnet-path', paths);
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed('An unknown error occurred');
		}
	}
}

// Run the action
run();
