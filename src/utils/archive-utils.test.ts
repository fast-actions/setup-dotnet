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

		const result = await extractArchive('/path/to/downloaded-file', 'zip');

		expect(toolCache.extractZip).toHaveBeenCalledWith(
			'/path/to/downloaded-file',
		);
		expect(result).toBe(mockPath);
	});

	it('should extract tar.gz files', async () => {
		const mockPath = '/extracted/path';
		vi.mocked(toolCache.extractTar).mockResolvedValue(mockPath);

		const result = await extractArchive('/path/to/downloaded-file', 'tar.gz');

		expect(toolCache.extractTar).toHaveBeenCalledWith(
			'/path/to/downloaded-file',
		);
		expect(result).toBe(mockPath);
	});

	it('should throw error for unsupported format', async () => {
		await expect(extractArchive('/path/to/file', 'rar')).rejects.toThrow(
			'Unsupported archive format: rar',
		);
	});

	it('should throw error for empty extension', async () => {
		await expect(extractArchive('/path/to/file', '')).rejects.toThrow(
			'Unsupported archive format:',
		);
	});

	it('should handle tar.gz regardless of file path format', async () => {
		const mockPath = '/extracted/path';
		vi.mocked(toolCache.extractTar).mockResolvedValue(mockPath);

		await extractArchive('C:\\Windows\\temp\\uuid-without-extension', 'tar.gz');

		expect(toolCache.extractTar).toHaveBeenCalled();
	});

	it('should extract zip files to destination directory', async () => {
		const mockPath = '/custom/destination';
		vi.mocked(toolCache.extractZip).mockResolvedValue(mockPath);

		const result = await extractArchive(
			'/path/to/downloaded-file',
			'zip',
			'/custom/destination',
		);

		expect(toolCache.extractZip).toHaveBeenCalledWith(
			'/path/to/downloaded-file',
			'/custom/destination',
		);
		expect(result).toBe(mockPath);
	});

	it('should extract tar.gz files to destination directory', async () => {
		const mockPath = '/custom/destination';
		vi.mocked(toolCache.extractTar).mockResolvedValue(mockPath);

		const result = await extractArchive(
			'/path/to/downloaded-file',
			'tar.gz',
			'/custom/destination',
		);

		expect(toolCache.extractTar).toHaveBeenCalledWith(
			'/path/to/downloaded-file',
			'/custom/destination',
		);
		expect(result).toBe(mockPath);
	});
});
