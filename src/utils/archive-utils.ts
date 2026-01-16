import * as toolCache from '@actions/tool-cache';

/**
 * Extract downloaded archive
 */
export async function extractArchive(
	archivePath: string,
	extension: string,
): Promise<string> {
	if (extension === 'zip') {
		return await toolCache.extractZip(archivePath);
	}
	if (extension === 'tar.gz') {
		return await toolCache.extractTar(archivePath);
	}
	throw new Error(`Unsupported archive format: ${extension}`);
}
