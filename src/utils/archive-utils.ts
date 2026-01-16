import * as toolCache from '@actions/tool-cache';

/**
 * Extract downloaded archive
 */
export async function extractArchive(archivePath: string): Promise<string> {
	if (archivePath.endsWith('.zip')) {
		return await toolCache.extractZip(archivePath);
	}
	if (archivePath.endsWith('.tar.gz')) {
		return await toolCache.extractTar(archivePath);
	}
	throw new Error(`Unsupported archive format: ${archivePath}`);
}
