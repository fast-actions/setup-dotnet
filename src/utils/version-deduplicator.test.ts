import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deduplicateVersions } from './version-deduplicator';
import * as versionResolver from './version-resolver';

// Mock version resolver
vi.mock('./version-resolver');

describe('deduplicateVersions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should keep all versions when no redundancies exist', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['10.0.100'],
			runtime: ['8.0.0'],
			aspnetcore: ['7.0.0'],
		});

		expect(result).toEqual({
			sdk: ['10.0.100'],
			runtime: ['8.0.0'],
			aspnetcore: ['7.0.0'],
		});
	});

	it('should remove runtime when same version exists in aspnetcore', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: [],
			runtime: ['8.0.0'],
			aspnetcore: ['8.0.0'],
		});

		expect(result).toEqual({
			sdk: [],
			runtime: [],
			aspnetcore: ['8.0.0'],
		});
	});

	it('should remove runtime when same version exists in sdk', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['8.0.100'],
			runtime: ['8.0.100'],
			aspnetcore: [],
		});

		expect(result).toEqual({
			sdk: ['8.0.100'],
			runtime: [],
			aspnetcore: [],
		});
	});

	it('should remove aspnetcore when same version exists in sdk', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['8.0.100'],
			runtime: [],
			aspnetcore: ['8.0.100'],
		});

		expect(result).toEqual({
			sdk: ['8.0.100'],
			runtime: [],
			aspnetcore: [],
		});
	});

	it('should resolve wildcards and remove duplicates', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => {
				if (version === '8.0.x') return '8.0.23';
				return version;
			},
		);

		const result = await deduplicateVersions({
			sdk: [],
			runtime: ['8.0.23', '8.0.x'],
			aspnetcore: [],
		});

		expect(result).toEqual({
			sdk: [],
			runtime: ['8.0.23'], // 8.0.x removed as duplicate
			aspnetcore: [],
		});
	});

	it('should handle complex scenario with multiple types and wildcards', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version, _type) => {
				if (version === '8.0.x') return '8.0.23';
				if (version === '10.x.x') return '10.0.100';
				return version;
			},
		);

		const result = await deduplicateVersions({
			sdk: ['10.x.x', '9.0.100'],
			runtime: ['8.0.23', '8.0.x', '7.0.0'],
			aspnetcore: ['8.0.23'],
		});

		expect(result).toEqual({
			sdk: ['10.x.x', '9.0.100'],
			runtime: ['7.0.0'], // 8.0.23 and 8.0.x removed (covered by aspnetcore)
			aspnetcore: ['8.0.23'],
		});
	});

	it('should remove runtime and aspnetcore when sdk covers both', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['8.0.100'],
			runtime: ['8.0.100'],
			aspnetcore: ['8.0.100'],
		});

		expect(result).toEqual({
			sdk: ['8.0.100'],
			runtime: [],
			aspnetcore: [],
		});
	});

	it('should handle multiple versions with mixed redundancies', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['10.0.100', '9.0.100'],
			runtime: ['10.0.100', '8.0.0'],
			aspnetcore: ['9.0.100', '7.0.0'],
		});

		expect(result).toEqual({
			sdk: ['10.0.100', '9.0.100'],
			runtime: ['8.0.0'], // 10.0.100 removed (covered by sdk)
			aspnetcore: ['7.0.0'], // 9.0.100 removed (covered by sdk)
		});
	});

	it('should handle empty inputs', async () => {
		const result = await deduplicateVersions({
			sdk: [],
			runtime: [],
			aspnetcore: [],
		});

		expect(result).toEqual({
			sdk: [],
			runtime: [],
			aspnetcore: [],
		});
	});

	it('should remove duplicates within same type', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => {
				if (version === '10.x') return '10.0.100';
				if (version === '10.0.x') return '10.0.100';
				return version;
			},
		);

		const result = await deduplicateVersions({
			sdk: ['10.0.100', '10.x', '10.0.x'],
			runtime: [],
			aspnetcore: [],
		});

		expect(result).toEqual({
			sdk: ['10.0.100'], // Other two removed as duplicates
			runtime: [],
			aspnetcore: [],
		});
	});

	it('should handle wildcards resolving to same version across types', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version, _type) => {
				if (version === '8.x' || version === '8.0.x') return '8.0.23';
				return version;
			},
		);

		const result = await deduplicateVersions({
			sdk: [],
			runtime: ['8.x'],
			aspnetcore: ['8.0.x'],
		});

		expect(result).toEqual({
			sdk: [],
			runtime: [], // 8.x removed (covered by aspnetcore 8.0.x)
			aspnetcore: ['8.0.x'],
		});
	});

	it('should preserve order of non-redundant versions', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['10.0.100', '9.0.100', '8.0.100'],
			runtime: ['7.0.0', '6.0.0'],
			aspnetcore: [],
		});

		expect(result).toEqual({
			sdk: ['10.0.100', '9.0.100', '8.0.100'],
			runtime: ['7.0.0', '6.0.0'],
			aspnetcore: [],
		});
	});

	it('should handle scenario where aspnetcore and runtime have same version but not in sdk', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['10.0.100'],
			runtime: ['8.0.0'],
			aspnetcore: ['8.0.0'],
		});

		expect(result).toEqual({
			sdk: ['10.0.100'],
			runtime: [], // Removed because aspnetcore has same version
			aspnetcore: ['8.0.0'],
		});
	});

	it('should handle all three types with different versions', async () => {
		vi.mocked(versionResolver.resolveVersion).mockImplementation(
			async (version) => version,
		);

		const result = await deduplicateVersions({
			sdk: ['10.0.100', '9.0.100'],
			runtime: ['8.0.0', '7.0.0'],
			aspnetcore: ['6.0.0'],
		});

		expect(result).toEqual({
			sdk: ['10.0.100', '9.0.100'],
			runtime: ['8.0.0', '7.0.0'],
			aspnetcore: ['6.0.0'],
		});
	});
});
