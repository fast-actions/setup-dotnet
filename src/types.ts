export type DotnetType = 'sdk' | 'runtime' | 'aspnetcore';

export interface VersionSet {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
}

export interface VersionSetWithPrerelease {
	sdk: VersionInfo;
	runtime: VersionInfo;
	aspnetcore: VersionInfo;
}

export interface VersionInfo {
	versions: string[];
	allowPrerelease: boolean;
}

export interface FileInfo {
	name: string;
	rid: string;
	url: string;
	hash: string;
}

export interface Release {
	sdks?: Array<{ version: string; files?: FileInfo[] }>;
	runtime?: { version: string; files?: FileInfo[] };
	'aspnetcore-runtime'?: { version: string; files?: FileInfo[] };
}

export interface ReleaseManifest {
	releases: Release[];
}

export type InstallSource =
	| 'installation-directory'
	| 'github-cache'
	| 'download';

// From installer.types.ts
export interface InstallOptions {
	version: string;
	type: DotnetType;
}

export interface InstallResult {
	version: string;
	type: DotnetType;
	path: string;
	source: InstallSource;
}

export interface DownloadInfo {
	url: string;
	hash: string;
}

// From utils/global-json.types.ts
export interface GlobalJson {
	sdk?: {
		version?: string;
		rollForward?: string;
		allowPrerelease?: boolean;
	};
}

export interface SdkInfo {
	version: string;
	allowPrerelease: boolean;
}

// From utils/cache.types.ts
export interface VersionEntry {
	version: string;
	type: DotnetType;
}

// From utils/versioning/versioning.types.ts
export interface ReleaseInfo {
	'channel-version': string;
	'latest-sdk': string;
	'latest-release': string;
	'latest-runtime'?: string;
	'release-type': 'sts' | 'lts';
	'support-phase': string;
}

export interface ResolvedVersion {
	value: string;
	channel: string;
}

export interface SdkIncludedVersions {
	runtime: string | null;
	aspnetcore: string | null;
}
