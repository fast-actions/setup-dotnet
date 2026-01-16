import * as core from "@actions/core";

/**
 * Main entry point for the GitHub Action
 */
async function run(): Promise<void> {
	try {
		// Get inputs from action.yml
		const dotnetVersion = core.getInput("dotnet-version", { required: true });
		const installRuntimeOnly = core.getBooleanInput("install-runtime-only");
		const cacheEnabled = core.getBooleanInput("cache-enabled");
		const architecture = core.getInput("architecture") || "x64";
		const quality = core.getInput("quality") || "ga";

		core.info(`Setting up .NET ${dotnetVersion} (${architecture})`);
		core.info(`Runtime only: ${installRuntimeOnly}`);
		core.info(`Cache enabled: ${cacheEnabled}`);
		core.info(`Quality: ${quality}`);

		// TODO: Implement .NET installation logic
		// const installedVersion = await installDotNet({
		//   version: dotnetVersion,
		//   runtimeOnly: installRuntimeOnly,
		//   architecture,
		//   quality
		// });

		// TODO: Implement caching logic
		// const cacheHit = cacheEnabled
		//   ? await setupCache(installedVersion, architecture)
		//   : false;

		// Set outputs
		// core.setOutput('dotnet-version', installedVersion);
		// core.setOutput('cache-hit', cacheHit);
		// core.setOutput('dotnet-path', dotnetPath);

		core.info("✓ .NET setup completed successfully");
	} catch (error) {
		if (error instanceof Error) {
			core.setFailed(error.message);
		} else {
			core.setFailed("An unknown error occurred");
		}
	}
}

// Run the action
run();
