import * as toolCache from '@actions/tool-cache';

export async function extractArchive(
	archivePath: string,
	extension: string,
	destination?: string,
): Promise<string> {
	if (extension === 'zip') {
		return destination
			? await toolCache.extractZip(archivePath, destination)
			: await toolCache.extractZip(archivePath);
	}
	if (extension === 'tar.gz') {
		return destination
			? await toolCache.extractTar(archivePath, destination)
			: await toolCache.extractTar(archivePath);
	}
	throw new Error(`Unsupported archive format: ${extension}`);
}
