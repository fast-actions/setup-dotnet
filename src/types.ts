export type DotnetType = 'sdk' | 'runtime' | 'aspnetcore';

export interface VersionSet {
	sdk: string[];
	runtime: string[];
	aspnetcore: string[];
}
