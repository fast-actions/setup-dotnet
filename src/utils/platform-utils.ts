import * as os from 'node:os';

export function getPlatform(): string {
	const platform = os.platform();
	switch (platform) {
		case 'darwin':
			return 'osx';
		case 'win32':
			return 'win';
		case 'linux':
			return 'linux';
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}
}

export function getArchitecture(): string {
	const arch = os.arch();
	switch (arch) {
		case 'x64':
			return 'x64';
		case 'arm64':
			return 'arm64';
		case 'arm':
			return 'arm';
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}
}
