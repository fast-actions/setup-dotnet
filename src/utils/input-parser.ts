// Parses single, comma-separated and newline-separated (YAML multiline) version
// inputs. YAML array bullet lines (starting with '-') are dropped, not parsed.
export function parseVersions(input: string): string[] {
	if (!input) return [];
	return input
		.split(/[\n,]/)
		.map((version) => version.trim())
		.filter((version) => version.length > 0 && !version.startsWith('-'));
}
