// Parses single, comma-separated and newline-separated (YAML multiline) version
// inputs. YAML array bullet lines (starting with '-') are dropped, not parsed.
export function parseVersions(input: string): string[] {
	if (!input) return [];
	return input
		.split(/[\n,]/)
		.map((v) => v.trim())
		.filter((v) => v.length > 0 && !v.startsWith('-'));
}
