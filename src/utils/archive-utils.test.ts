import * as toolCache from '@actions/tool-cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractArchive } from './archive-utils';

vi.mock('@actions/tool-cache');

describe('extractArchive', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should extract zip files', async () => {
		const mockPath = '/extracted/path';
		vi.mocked(toolCache.extractZip).mockResolvedValue(mockPath);

		const result = await extractArchive('/path/to/file.zip');

		expect(toolCache.extractZip).toHaveBeenCalledWith('/path/to/file.zip');
		expect(result).toBe(mockPath);
	});

	it('should extract tar.gz files', async () => {
		const mockPath = '/extracted/path';
		vi.mocked(toolCache.extractTar).mockResolvedValue(mockPath);

		const result = await extractArchive('/path/to/file.tar.gz');

		expect(toolCache.extractTar).toHaveBeenCalledWith('/path/to/file.tar.gz');
		expect(result).toBe(mockPath);
	});

	it('should throw error for unsupported format', async () => {
		await expect(extractArchive('/path/to/file.rar')).rejects.toThrow(
			'Unsupported archive format: /path/to/file.rar',
		);
	});

	it('should throw error for files without extension', async () => {
		await expect(extractArchive('/path/to/file')).rejects.toThrow(
			'Unsupported archive format: /path/to/file',
		);
	});

	it('should handle .tar.gz with different path formats', async () => {
		const mockPath = '/extracted/path';
		vi.mocked(toolCache.extractTar).mockResolvedValue(mockPath);

		await extractArchive('C:\\Windows\\temp\\dotnet-sdk-10.0.0.tar.gz');

		expect(toolCache.extractTar).toHaveBeenCalled();
	});
});
