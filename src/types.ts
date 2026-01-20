export type DotnetType = 'sdk' | 'runtime' | 'aspnetcore';

export interface VersionSet {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
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
