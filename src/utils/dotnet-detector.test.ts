import * as exec from '@actions/exec';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInstalledVersions, isVersionInstalled } from './dotnet-detector';

// Mock @actions/exec
vi.mock('@actions/exec');

describe('dotnet-detector', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('getInstalledVersions', () => {
		it('should parse SDK versions correctly', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					if (args?.includes('--list-sdks')) {
						options?.listeners?.stdout?.(
							Buffer.from(
								'8.0.100 [/usr/share/dotnet/sdk]\n9.0.100 [/usr/share/dotnet/sdk]\n',
							),
						);
					} else if (args?.includes('--list-runtimes')) {
						options?.listeners?.stdout?.(Buffer.from(''));
					}
					return 0;
				},
			);

			const result = await getInstalledVersions();

			expect(result.sdk).toEqual(['8.0.100', '9.0.100']);
			expect(result.runtime).toEqual([]);
			expect(result.aspnetcore).toEqual([]);
		});

		it('should parse Runtime versions correctly', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					if (args?.includes('--list-sdks')) {
						options?.listeners?.stdout?.(Buffer.from(''));
					} else if (args?.includes('--list-runtimes')) {
						options?.listeners?.stdout?.(
							Buffer.from(
								'Microsoft.NETCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\n' +
									'Microsoft.NETCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\n',
							),
						);
					}
					return 0;
				},
			);

			const result = await getInstalledVersions();

			expect(result.sdk).toEqual([]);
			expect(result.runtime).toEqual(['8.0.0', '9.0.0']);
			expect(result.aspnetcore).toEqual([]);
		});

		it('should parse ASP.NET Core Runtime versions correctly', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					if (args?.includes('--list-sdks')) {
						options?.listeners?.stdout?.(Buffer.from(''));
					} else if (args?.includes('--list-runtimes')) {
						options?.listeners?.stdout?.(
							Buffer.from(
								'Microsoft.AspNetCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]\n' +
									'Microsoft.AspNetCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]\n',
							),
						);
					}
					return 0;
				},
			);

			const result = await getInstalledVersions();

			expect(result.sdk).toEqual([]);
			expect(result.runtime).toEqual([]);
			expect(result.aspnetcore).toEqual(['8.0.0', '9.0.0']);
		});

		it('should parse mixed runtime output', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					if (args?.includes('--list-sdks')) {
						options?.listeners?.stdout?.(Buffer.from(''));
					} else if (args?.includes('--list-runtimes')) {
						options?.listeners?.stdout?.(
							Buffer.from(
								'Microsoft.AspNetCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]\n' +
									'Microsoft.NETCore.App 8.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\n' +
									'Microsoft.NETCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\n' +
									'Microsoft.AspNetCore.App 9.0.0 [/usr/share/dotnet/shared/Microsoft.AspNetCore.App]\n',
							),
						);
					}
					return 0;
				},
			);

			const result = await getInstalledVersions();

			expect(result.runtime).toEqual(['8.0.0', '9.0.0']);
			expect(result.aspnetcore).toEqual(['8.0.0', '9.0.0']);
		});

		it('should parse preview versions correctly', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					if (args?.includes('--list-sdks')) {
						options?.listeners?.stdout?.(
							Buffer.from(
								'9.0.100-preview.7.24407.12 [/usr/share/dotnet/sdk]\n',
							),
						);
					} else if (args?.includes('--list-runtimes')) {
						options?.listeners?.stdout?.(
							Buffer.from(
								'Microsoft.NETCore.App 9.0.0-preview.7.24405.7 [/usr/share/dotnet/shared/Microsoft.NETCore.App]\n',
							),
						);
					}
					return 0;
				},
			);

			const result = await getInstalledVersions();

			expect(result.sdk).toEqual(['9.0.100-preview.7.24407.12']);
			expect(result.runtime).toEqual(['9.0.0-preview.7.24405.7']);
		});

		it('should handle empty output', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					_args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					options?.listeners?.stdout?.(Buffer.from(''));
					return 0;
				},
			);

			const result = await getInstalledVersions();

			expect(result.sdk).toEqual([]);
			expect(result.runtime).toEqual([]);
			expect(result.aspnetcore).toEqual([]);
		});

		it('should handle command failure gracefully', async () => {
			const mockExec = vi.mocked(exec.exec);

			mockExec.mockImplementation(
				async (
					_commandLine: string,
					args?: string[],
					options?: exec.ExecOptions,
				): Promise<number> => {
					if (args?.includes('--list-sdks')) {
						options?.listeners?.stderr?.(
							Buffer.from('dotnet: command not found'),
						);
						return 127;
					}
					options?.listeners?.stdout?.(Buffer.from(''));
					return 0;
				},
			);

			const result = await getInstalledVersions();

			// Should return empty arrays on failure
			expect(result.sdk).toEqual([]);
			expect(result.runtime).toEqual([]);
			expect(result.aspnetcore).toEqual([]);
		});

		it('should run --list-runtimes only once for Runtime and ASP.NET Core', async () => {
			const mockExec = vi.mocked(exec.exec);
			mockExec.mockResolvedValue(0);

			await getInstalledVersions('/custom/dotnet');

			expect(mockExec).toHaveBeenCalledTimes(2);
			expect(mockExec).toHaveBeenCalledWith(
				'/custom/dotnet',
				['--list-sdks'],
				expect.any(Object),
			);
			expect(mockExec).toHaveBeenCalledWith(
				'/custom/dotnet',
				['--list-runtimes'],
				expect.any(Object),
			);
		});

		it('should handle exception gracefully', async () => {
			const mockExec = vi.mocked(exec.exec);
			mockExec.mockRejectedValue(new Error('Command execution failed'));

			const result = await getInstalledVersions();

			// Should return empty arrays on exception
			expect(result.sdk).toEqual([]);
			expect(result.runtime).toEqual([]);
			expect(result.aspnetcore).toEqual([]);
		});
	});

	describe('isVersionInstalled', () => {
		const mockInstalled = {
			sdk: ['8.0.100', '9.0.100'],
			runtime: ['8.0.0', '9.0.0'],
			aspnetcore: ['8.0.0', '9.0.0'],
		};

		it('should return true for installed SDK version', () => {
			expect(isVersionInstalled('8.0.100', 'sdk', mockInstalled)).toBe(true);
		});

		it('should return false for non-installed SDK version', () => {
			expect(isVersionInstalled('7.0.100', 'sdk', mockInstalled)).toBe(false);
		});

		it('should return true for installed runtime version', () => {
			expect(isVersionInstalled('8.0.0', 'runtime', mockInstalled)).toBe(true);
		});

		it('should return false for non-installed runtime version', () => {
			expect(isVersionInstalled('7.0.0', 'runtime', mockInstalled)).toBe(false);
		});

		it('should return true for installed aspnetcore version', () => {
			expect(isVersionInstalled('9.0.0', 'aspnetcore', mockInstalled)).toBe(
				true,
			);
		});

		it('should return false for non-installed aspnetcore version', () => {
			expect(isVersionInstalled('7.0.0', 'aspnetcore', mockInstalled)).toBe(
				false,
			);
		});
	});
});
