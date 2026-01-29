// Supports: single version, comma-separated, newline-separated (YAML multiline), YAML array format
export function parseVersions(input: string): string[] {
	if (!input) return [];
	return input
		.split(/[\n,]/)
		.map((v) => v.trim())
		.filter((v) => v.length > 0 && !v.startsWith('-'));
}
