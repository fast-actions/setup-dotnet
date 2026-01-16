import * as os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArchitecture, getPlatform } from './platform-utils';

vi.mock('node:os');

describe('getPlatform', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return osx for darwin', () => {
		vi.mocked(os.platform).mockReturnValue('darwin');
		expect(getPlatform()).toBe('osx');
	});

	it('should return win for win32', () => {
		vi.mocked(os.platform).mockReturnValue('win32');
		expect(getPlatform()).toBe('win');
	});

	it('should return linux for linux', () => {
		vi.mocked(os.platform).mockReturnValue('linux');
		expect(getPlatform()).toBe('linux');
	});

	it('should throw error for unsupported platform', () => {
		vi.mocked(os.platform).mockReturnValue('freebsd' as NodeJS.Platform);
		expect(() => getPlatform()).toThrow('Unsupported platform: freebsd');
	});
});

describe('getArchitecture', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should return x64 for x64', () => {
		vi.mocked(os.arch).mockReturnValue('x64');
		expect(getArchitecture()).toBe('x64');
	});

	it('should return arm64 for arm64', () => {
		vi.mocked(os.arch).mockReturnValue('arm64');
		expect(getArchitecture()).toBe('arm64');
	});

	it('should return arm for arm', () => {
		vi.mocked(os.arch).mockReturnValue('arm');
		expect(getArchitecture()).toBe('arm');
	});

	it('should throw error for unsupported architecture', () => {
		vi.mocked(os.arch).mockReturnValue('ia32');
		expect(() => getArchitecture()).toThrow('Unsupported architecture: ia32');
	});
});
