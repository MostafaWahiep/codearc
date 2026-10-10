import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
	ChallengeLevelManifest,
	ChallengeManifest,
} from '@codearc/shared';
import type {
	ChallengeRepository,
	LoadedChallenge,
	LoadedChallengeLevel,
} from '../application/Challenge';

export class FileChallengeRepository implements ChallengeRepository {
	public constructor(private readonly challengeRoot: string) {}

	public async load(): Promise<LoadedChallenge> {
		const rootPath = path.resolve(this.challengeRoot);
		const manifestPath = path.join(rootPath, 'challenge.json');
		const manifestContents = await readFile(manifestPath, 'utf8');
		const manifest = parseManifest(JSON.parse(manifestContents));

		const levels = await Promise.all(
			manifest.levels.map(async (level): Promise<LoadedChallengeLevel> => ({
				manifest: level,
				requirement: await this.readAsset(rootPath, level.requirementPath),
				designFeedback: await this.readAsset(rootPath, level.designFeedbackPath),
				testsPath: resolveAssetPath(rootPath, level.testsPath),
			})),
		);
		const starterPath = resolveAssetPath(rootPath, manifest.starterPath);
		const entrypointPath = resolveAssetPath(rootPath, manifest.entrypointPath);
		assertEntrypointInsideStarter(starterPath, entrypointPath);

		return {
			manifest,
			rootPath,
			starterPath,
			entrypointPath,
			levels,
		};
	}

	private async readAsset(rootPath: string, relativePath: string): Promise<string> {
		return readFile(resolveAssetPath(rootPath, relativePath), 'utf8');
	}
}

function parseManifest(value: unknown): ChallengeManifest {
	const manifest = requireObject(value, 'challenge manifest');
	assertOnlyKeys(
		manifest,
		['id', 'title', 'description', 'starterPath', 'entrypointPath', 'levels'],
		'challenge manifest',
	);

	if (!Array.isArray(manifest.levels) || manifest.levels.length === 0) {
		throw new Error('Challenge manifest "levels" must be a non-empty array.');
	}

	const levels = manifest.levels.map(parseLevel);
	const levelIds = new Set(levels.map((level) => level.id));
	if (levelIds.size !== levels.length) {
		throw new Error('Challenge manifest level IDs must be unique.');
	}

	return {
		id: requireId(manifest, 'id', 'challenge manifest'),
		title: requireString(manifest, 'title', 'challenge manifest'),
		description: requireString(manifest, 'description', 'challenge manifest'),
		starterPath: requireRelativePath(manifest, 'starterPath', 'challenge manifest'),
		entrypointPath: requireRelativePath(manifest, 'entrypointPath', 'challenge manifest'),
		levels,
	};
}

function parseLevel(value: unknown, index: number): ChallengeLevelManifest {
	const context = `challenge level at index ${index}`;
	const level = requireObject(value, context);
	assertOnlyKeys(
		level,
		['id', 'title', 'requirementPath', 'designFeedbackPath', 'testsPath'],
		context,
	);

	return {
		id: requireId(level, 'id', context),
		title: requireString(level, 'title', context),
		requirementPath: requireRelativePath(level, 'requirementPath', context),
		designFeedbackPath: requireRelativePath(level, 'designFeedbackPath', context),
		testsPath: requireRelativePath(level, 'testsPath', context),
	};
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`Expected ${context} to be an object.`);
	}

	return value as Record<string, unknown>;
}

function requireString(
	object: Record<string, unknown>,
	key: string,
	context: string,
): string {
	const value = object[key];
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Expected ${context} "${key}" to be a non-empty string.`);
	}

	return value;
}

function requireId(
	object: Record<string, unknown>,
	key: string,
	context: string,
): string {
	const value = requireString(object, key, context);
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
		throw new Error(`Expected ${context} "${key}" to be a lowercase kebab-case ID.`);
	}

	return value;
}

function requireRelativePath(
	object: Record<string, unknown>,
	key: string,
	context: string,
): string {
	const value = requireString(object, key, context);
	if (path.isAbsolute(value) || value.includes('\\')) {
		throw new Error(`Expected ${context} "${key}" to be a portable relative path.`);
	}

	const segments = value.split('/');
	if (segments.includes('..')) {
		throw new Error(`Expected ${context} "${key}" not to leave the challenge directory.`);
	}

	return value;
}

function assertOnlyKeys(
	object: Record<string, unknown>,
	allowedKeys: string[],
	context: string,
): void {
	const unexpectedKeys = Object.keys(object).filter((key) => !allowedKeys.includes(key));
	if (unexpectedKeys.length > 0) {
		throw new Error(`Unexpected ${context} field: "${unexpectedKeys[0]}".`);
	}
}

function resolveAssetPath(rootPath: string, relativePath: string): string {
	const resolvedPath = path.resolve(rootPath, relativePath);
	const rootPrefix = `${rootPath}${path.sep}`;

	if (resolvedPath !== rootPath && !resolvedPath.startsWith(rootPrefix)) {
		throw new Error(`Challenge asset path leaves the challenge directory: "${relativePath}".`);
	}

	return resolvedPath;
}

function assertEntrypointInsideStarter(
	starterPath: string,
	entrypointPath: string,
): void {
	const starterPrefix = `${starterPath}${path.sep}`;
	if (!entrypointPath.startsWith(starterPrefix)) {
		throw new Error('Challenge entrypointPath must be inside starterPath.');
	}
}
