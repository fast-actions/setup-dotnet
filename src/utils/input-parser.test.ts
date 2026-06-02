import { describe, expect, it } from 'vitest';
import { parseVersions } from './input-parser';

describe('parseVersions', () => {
	it('should return empty array for empty input', () => {
		expect(parseVersions('')).toEqual([]);
	});

	it('should parse single version', () => {
		expect(parseVersions('10.x.x')).toEqual(['10.x.x']);
	});

	it('should parse comma-separated versions', () => {
		expect(parseVersions('10.x.x, 9.0.0')).toEqual(['10.x.x', '9.0.0']);
	});

	it('should parse comma-separated versions without spaces', () => {
		expect(parseVersions('10.x.x,9.0.0,8.0.0')).toEqual([
			'10.x.x',
			'9.0.0',
			'8.0.0',
		]);
	});

	it('should parse newline-separated versions (YAML multiline)', () => {
		expect(parseVersions('10.x.x\n9.0.0\n8.0.0')).toEqual([
			'10.x.x',
			'9.0.0',
			'8.0.0',
		]);
	});

	it('should handle mixed whitespace', () => {
		expect(parseVersions('  10.x.x  \n  9.0.0  ')).toEqual(['10.x.x', '9.0.0']);
	});

	it('should filter out YAML array markers', () => {
		expect(parseVersions('- 10.x.x\n- 9.0.0')).toEqual([]);
	});

	it('should filter out empty lines', () => {
		expect(parseVersions('10.x.x\n\n9.0.0\n\n8.0.0')).toEqual([
			'10.x.x',
			'9.0.0',
			'8.0.0',
		]);
	});

	it('should handle combination of comma and newline', () => {
		expect(parseVersions('10.x.x, 9.0.0\n8.0.0')).toEqual([
			'10.x.x',
			'9.0.0',
			'8.0.0',
		]);
	});

	it('should handle version with preview suffix', () => {
		expect(parseVersions('10.0.0-preview.1, 9.0.0')).toEqual([
			'10.0.0-preview.1',
			'9.0.0',
		]);
	});

	it('should handle version with rc suffix', () => {
		expect(parseVersions('9.0.100-rc.2, 8.0.0')).toEqual([
			'9.0.100-rc.2',
			'8.0.0',
		]);
	});

	it('should handle version with complex prerelease identifier', () => {
		expect(parseVersions('9.0.100-preview.7.24407.12')).toEqual([
			'9.0.100-preview.7.24407.12',
		]);
	});

	it('should handle multiple preview versions', () => {
		expect(
			parseVersions('9.0.100-preview.7, 9.0.100-preview.6, 9.0.0'),
		).toEqual(['9.0.100-preview.7', '9.0.100-preview.6', '9.0.0']);
	});

	it('should trim versions with extra spaces', () => {
		expect(parseVersions('  10.x.x  ,  9.0.0  ')).toEqual(['10.x.x', '9.0.0']);
	});

	it('should return empty array for whitespace-only input', () => {
		expect(parseVersions('   ')).toEqual([]);
		expect(parseVersions('\n\n')).toEqual([]);
		expect(parseVersions('\t')).toEqual([]);
	});

	it('should return empty array for separators only', () => {
		expect(parseVersions(',,')).toEqual([]);
		expect(parseVersions(', \n ,')).toEqual([]);
	});

	it('should drop empty entries between separators', () => {
		expect(parseVersions('10.0.0,,9.0.0')).toEqual(['10.0.0', '9.0.0']);
		expect(parseVersions('10.0.0,\n,9.0.0')).toEqual(['10.0.0', '9.0.0']);
	});

	it('should trim tab characters around versions', () => {
		expect(parseVersions('\t10.0.0\t')).toEqual(['10.0.0']);
	});
});
