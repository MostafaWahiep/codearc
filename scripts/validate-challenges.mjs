import { access, readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const challengesRoot = path.join(repositoryRoot, 'challenges');
const schemaPath = path.join(
	repositoryRoot,
	'shared',
	'schemas',
	'challenge-manifest.schema.json',
);

const schema = await readJson(schemaPath, 'challenge manifest schema');
const ajv = new Ajv({ allErrors: true });
const validateManifest = ajv.compile(schema);

const challengeDirectories = (await readdir(challengesRoot, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

if (challengeDirectories.length === 0) {
	throw new Error(`No challenge directories found in ${challengesRoot}.`);
}

let validationFailed = false;

for (const directoryName of challengeDirectories) {
	try {
		await validateChallenge(directoryName);
		console.log(`✓ ${directoryName}`);
	} catch (error) {
		validationFailed = true;
		console.error(`✗ ${directoryName}`);
		console.error(formatError(error));
	}
}

if (validationFailed) {
	process.exitCode = 1;
} else {
	console.log(`Validated ${challengeDirectories.length} challenge package(s).`);
}

async function validateChallenge(directoryName) {
	const challengeRoot = path.join(challengesRoot, directoryName);
	const manifestPath = path.join(challengeRoot, 'challenge.json');

	await access(manifestPath);
	const manifest = await readJson(manifestPath, `${directoryName} manifest`);

	if (!validateManifest(manifest)) {
		const details = ajv.errorsText(validateManifest.errors, { separator: '\n' });
		throw new Error(`Manifest does not match the shared schema:\n${details}`);
	}

	const levelIds = manifest.levels.map((level) => level.id);
	if (new Set(levelIds).size !== levelIds.length) {
		throw new Error('Manifest level IDs must be unique.');
	}

	await assertAsset(challengeRoot, manifest.starterPath, 'directory', 'starterPath');
	await assertAsset(challengeRoot, manifest.entrypointPath, 'file', 'entrypointPath');
	assertInsideStarter(challengeRoot, manifest.starterPath, manifest.entrypointPath);

	for (const level of manifest.levels) {
		await assertAsset(
			challengeRoot,
			level.requirementPath,
			'file',
			`${level.id}.requirementPath`,
		);
		await assertAsset(
			challengeRoot,
			level.designFeedbackPath,
			'file',
			`${level.id}.designFeedbackPath`,
		);
		await assertAsset(
			challengeRoot,
			level.testsPath,
			'directory',
			`${level.id}.testsPath`,
		);
	}
}

function assertInsideStarter(challengeRoot, starterPath, entrypointPath) {
	const starterRoot = path.resolve(challengeRoot, starterPath);
	const entrypoint = path.resolve(challengeRoot, entrypointPath);
	const starterPrefix = `${starterRoot}${path.sep}`;

	if (!entrypoint.startsWith(starterPrefix)) {
		throw new Error(`entrypointPath must be inside starterPath: ${entrypointPath}`);
	}
}

async function assertAsset(challengeRoot, relativePath, expectedType, label) {
	const assetPath = path.resolve(challengeRoot, relativePath);
	const challengePrefix = `${challengeRoot}${path.sep}`;

	if (assetPath !== challengeRoot && !assetPath.startsWith(challengePrefix)) {
		throw new Error(`${label} leaves the challenge directory: ${relativePath}`);
	}

	let assetStats;
	try {
		assetStats = await stat(assetPath);
	} catch {
		throw new Error(`${label} does not exist: ${relativePath}`);
	}

	const hasExpectedType = expectedType === 'file'
		? assetStats.isFile()
		: assetStats.isDirectory();

	if (!hasExpectedType) {
		throw new Error(`${label} must reference a ${expectedType}: ${relativePath}`);
	}
}

async function readJson(filePath, description) {
	let contents;
	try {
		contents = await readFile(filePath, 'utf8');
	} catch (error) {
		throw new Error(`Could not read ${description} at ${filePath}.`, { cause: error });
	}

	try {
		return JSON.parse(contents);
	} catch (error) {
		throw new Error(`Could not parse ${description} at ${filePath}.`, { cause: error });
	}
}

function formatError(error) {
	return error instanceof Error ? error.message : String(error);
}
