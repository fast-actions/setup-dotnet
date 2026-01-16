/**
 * Parse comma-separated or newline-separated versions
 * Supports:
 * - Single version: "10.x.x"
 * - Comma-separated: "10.x.x, 9.0.0"
 * - Newline-separated (YAML multiline): "10.x.x\n9.0.0"
 * - YAML array format (filters out "-" markers)
 */
export function parseVersions(input: string): string[] {
	if (!input) return [];
	return input
		.split(/[\n,]/)
		.map((v) => v.trim())
		.filter((v) => v.length > 0 && !v.startsWith('-'));
}
