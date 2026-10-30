import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BackendClient } from '../backend/BackendClient';
import type {
	AttemptDto,
	StarterFilesDto,
} from '../backend/BackendTypes';
import {
	LearnerWorkspaceService,
	type OpenFolderOptions,
} from '../infrastructure/LearnerWorkspaceService';

const attemptId = '22222222-2222-4222-8222-222222222222';

suite('LearnerWorkspaceService', () => {
	let storagePath: string;

	setup(async () => {
		storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'codearc-workspace-'));
	});

	teardown(async () => {
		await fs.rm(storagePath, { recursive: true, force: true });
	});

	test('creates versioned starter files and attempt metadata', async () => {
		const calls: Array<{ challengeId: string; version: string }> = [];
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async (challengeId, version) => {
				calls.push({ challengeId, version });
				return starterFiles();
			}),
		);

		await service.createWorkspace(attempt());

		const attemptRoot = expectedAttemptRoot(storagePath);
		const challengeRoot = path.join(attemptRoot, 'search-engine');
		assert.deepStrictEqual(calls, [
			{ challengeId: 'search-engine', version: '1' },
		]);
		assert.strictEqual(
			await fs.readFile(path.join(challengeRoot, 'search_engine.py'), 'utf8'),
			'class SearchEngine:\n    pass\n',
		);
		assert.strictEqual(
			await fs.readFile(
				path.join(challengeRoot, 'helpers', 'tokenize.py'),
				'utf8',
			),
			'def tokenize(text):\n    return text.split()\n',
		);
		assert.deepStrictEqual(
			JSON.parse(await fs.readFile(path.join(attemptRoot, 'attempt.json'), 'utf8')),
			{
				schemaVersion: 1,
				attemptId,
				challengeId: 'search-engine',
				challengeVersion: '1',
				entrypoint: 'search_engine.py',
			},
		);
	});

	test('does not fetch or overwrite an existing attempt workspace', async () => {
		const attemptRoot = expectedAttemptRoot(storagePath);
		const existingFile = path.join(attemptRoot, 'search-engine', 'notes.txt');
		await fs.mkdir(path.dirname(existingFile), { recursive: true });
		await fs.writeFile(existingFile, 'learner work\n', 'utf8');
		let requestedStarterFiles = false;
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => {
				requestedStarterFiles = true;
				return starterFiles();
			}),
		);

		await assert.rejects(
			service.createWorkspace(attempt()),
			/already exists/,
		);

		assert.strictEqual(requestedStarterFiles, false);
		assert.strictEqual(await fs.readFile(existingFile, 'utf8'), 'learner work\n');
	});

	test('rejects unsafe starter paths and removes the partial workspace', async () => {
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles({
				files: [{ filePath: '../outside.py', content: 'secret\n' }],
			})),
		);

		await assert.rejects(
			service.createWorkspace(attempt()),
			/Unsafe starter file path/,
		);

		assert.strictEqual(await exists(expectedAttemptRoot(storagePath)), false);
		assert.strictEqual(
			await exists(path.join(storagePath, 'learner-workspaces', 'outside.py')),
			false,
		);
	});

	test('removes the partial workspace when writing a starter file fails', async () => {
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles({
				files: [
					{ filePath: 'package', content: 'not a directory\n' },
					{ filePath: 'package/module.py', content: 'pass\n' },
				],
			})),
		);

		await assert.rejects(service.createWorkspace(attempt()));

		assert.strictEqual(await exists(expectedAttemptRoot(storagePath)), false);
	});

	test('restores an existing attempt workspace without fetching starter files', async () => {
		const firstService = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
		);
		await firstService.createWorkspace(attempt());

		let requestedStarterFiles = false;
		const restoredService = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => {
				requestedStarterFiles = true;
				return starterFiles();
			}),
		);

		const workspace = await restoredService.ensureWorkspace(attempt());

		assert.strictEqual(requestedStarterFiles, false);
		assert.strictEqual(workspace.attemptRootUri.fsPath, expectedAttemptRoot(storagePath));
		assert.strictEqual(
			workspace.challengeRootUri.fsPath,
			path.join(expectedAttemptRoot(storagePath), 'search-engine'),
		);
		assert.strictEqual(
			workspace.entrypointUri.fsPath,
			path.join(expectedAttemptRoot(storagePath), 'search-engine', 'search_engine.py'),
		);
	});

	test('finds the attempt represented by the opened challenge folder', async () => {
		const firstService = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
		);
		await firstService.createWorkspace(attempt());
		const challengeRoot = path.join(
			expectedAttemptRoot(storagePath),
			'search-engine',
		);
		const discoveryService = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => {
				throw new Error('Discovery must not fetch starter files.');
			}),
			() => [workspaceFolder(challengeRoot)],
		);

		const workspace = await discoveryService.findOpenedAttemptWorkspace();

		assert.strictEqual(workspace?.attemptId, attemptId);
		assert.strictEqual(workspace?.challengeId, 'search-engine');
		assert.strictEqual(workspace?.attemptRootUri.fsPath, expectedAttemptRoot(storagePath));
		assert.strictEqual(workspace?.challengeRootUri.fsPath, challengeRoot);
		assert.strictEqual(
			workspace?.entrypointUri.fsPath,
			path.join(challengeRoot, 'search_engine.py'),
		);
	});

	test('ignores an opened folder outside the learner workspace root', async () => {
		const unrelatedFolder = path.join(storagePath, 'another-project');
		await fs.mkdir(unrelatedFolder);
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
			() => [workspaceFolder(unrelatedFolder)],
		);

		assert.strictEqual(await service.findOpenedAttemptWorkspace(), undefined);
	});

	test('rejects an opened learner folder that disagrees with its metadata', async () => {
		const attemptRoot = expectedAttemptRoot(storagePath);
		const challengeRoot = path.join(attemptRoot, 'search-engine');
		await fs.mkdir(challengeRoot, { recursive: true });
		await fs.writeFile(path.join(challengeRoot, 'search_engine.py'), 'pass\n');
		await fs.writeFile(
			path.join(attemptRoot, 'attempt.json'),
			JSON.stringify({
				schemaVersion: 1,
				attemptId: 'different-attempt',
				challengeId: 'search-engine',
				challengeVersion: '1',
				entrypoint: 'search_engine.py',
			}),
			'utf8',
		);
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
			() => [workspaceFolder(challengeRoot)],
		);

		await assert.rejects(
			service.findOpenedAttemptWorkspace(),
			/does not match its attempt metadata/,
		);
	});

	test('rejects metadata for a different challenge version', async () => {
		const firstService = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
		);
		await firstService.createWorkspace(attempt());
		const changedAttempt = { ...attempt(), version: '2' };
		const restoredService = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
		);

		await assert.rejects(
			restoredService.ensureWorkspace(changedAttempt),
			/metadata mismatch/,
		);
	});

	test('rejects an unsafe entrypoint in restored metadata', async () => {
		const attemptRoot = expectedAttemptRoot(storagePath);
		const challengeRoot = path.join(attemptRoot, 'search-engine');
		await fs.mkdir(challengeRoot, { recursive: true });
		await fs.writeFile(
			path.join(attemptRoot, 'attempt.json'),
			JSON.stringify({
				schemaVersion: 1,
				attemptId,
				challengeId: 'search-engine',
				challengeVersion: '1',
				entrypoint: '../outside.py',
			}),
			'utf8',
		);
		const service = new LearnerWorkspaceService(
			vscode.Uri.file(storagePath),
			createBackendClient(async () => starterFiles()),
		);

		await assert.rejects(
			service.ensureWorkspace(attempt()),
			/Unsafe attempt entrypoint path/,
		);
	});

	test('reuses an empty window when opening an attempt', async () => {
		const openFolderCalls: OpenFolderCall[] = [];
		const service = createWorkspaceOpeningService(
			storagePath,
			undefined,
			undefined,
			openFolderCalls,
		);

		await service.openWorkspace(attempt());

		assertOpenFolderCall(
			openFolderCalls,
			storagePath,
			{ forceReuseWindow: true },
		);
	});

	test('opens a new window when another project is open', async () => {
		const openFolderCalls: OpenFolderCall[] = [];
		const unrelatedFolder = workspaceFolder(path.join(storagePath, 'other-project'));
		const service = createWorkspaceOpeningService(
			storagePath,
			[unrelatedFolder],
			undefined,
			openFolderCalls,
		);

		await service.openWorkspace(attempt());

		assertOpenFolderCall(
			openFolderCalls,
			storagePath,
			{ forceNewWindow: true },
		);
	});

	test('opens a new window when an empty workspace file is open', async () => {
		const openFolderCalls: OpenFolderCall[] = [];
		const service = createWorkspaceOpeningService(
			storagePath,
			[],
			vscode.Uri.file(path.join(storagePath, 'existing.code-workspace')),
			openFolderCalls,
		);

		await service.openWorkspace(attempt());

		assertOpenFolderCall(
			openFolderCalls,
			storagePath,
			{ forceNewWindow: true },
		);
	});

	test('opens the entrypoint when the attempt folder is already open', async () => {
		const challengeRoot = path.join(
			expectedAttemptRoot(storagePath),
			'search-engine',
		);
		const openFolderCalls: OpenFolderCall[] = [];
		const service = createWorkspaceOpeningService(
			storagePath,
			[workspaceFolder(challengeRoot)],
			undefined,
			openFolderCalls,
		);

		await service.openWorkspace(attempt());

		assert.deepStrictEqual(openFolderCalls, []);
		assert.strictEqual(
			vscode.window.activeTextEditor?.document.uri.fsPath,
			path.join(challengeRoot, 'search_engine.py'),
		);
	});
});

interface OpenFolderCall {
	folder: vscode.Uri;
	options: OpenFolderOptions;
}

function createWorkspaceOpeningService(
	storagePath: string,
	workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
	workspaceFile: vscode.Uri | undefined,
	openFolderCalls: OpenFolderCall[],
): LearnerWorkspaceService {
	return new LearnerWorkspaceService(
		vscode.Uri.file(storagePath),
		createBackendClient(async () => starterFiles()),
		() => workspaceFolders,
		() => workspaceFile,
		async (folder, options) => {
			openFolderCalls.push({ folder, options });
		},
	);
}

function assertOpenFolderCall(
	calls: OpenFolderCall[],
	storagePath: string,
	expectedOptions: OpenFolderOptions,
): void {
	assert.strictEqual(calls.length, 1);
	assert.strictEqual(
		calls[0].folder.fsPath,
		path.join(expectedAttemptRoot(storagePath), 'search-engine'),
	);
	assert.deepStrictEqual(calls[0].options, expectedOptions);
}

function attempt(): AttemptDto {
	return {
		id: attemptId,
		userId: '11111111-1111-4111-8111-111111111111',
		challengeId: 'search-engine',
		version: '1',
		status: 'in_progress',
		startedAt: '2026-10-24T12:00:00+00:00',
		updatedAt: '2026-10-24T12:00:00+00:00',
		completedAt: null,
		activeLevelId: 'single-term-search',
		levels: [],
	};
}

function starterFiles(
	overrides: Partial<StarterFilesDto> = {},
): StarterFilesDto {
	return {
		challengeId: 'search-engine',
		version: '1',
		entrypoint: 'search_engine.py',
		files: [
			{
				filePath: 'search_engine.py',
				content: 'class SearchEngine:\n    pass\n',
			},
			{
				filePath: 'helpers/tokenize.py',
				content: 'def tokenize(text):\n    return text.split()\n',
			},
		],
		...overrides,
	};
}

function createBackendClient(
	getStarterFiles: BackendClient['getStarterFiles'],
): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => { throw new Error('Not used'); },
		getAttempt: async () => { throw new Error('Not used'); },
		getVisibleLevel: async () => { throw new Error('Not used'); },
		getVisibleTests: async () => ({ runner: 'pytest', files: [] }),
		submitTestResults: async () => { throw new Error('Not used'); },
		getStarterFiles,
	};
}

function expectedAttemptRoot(storagePath: string): string {
	return path.join(storagePath, 'learner-workspaces', attemptId);
}

function workspaceFolder(folderPath: string): vscode.WorkspaceFolder {
	return {
		uri: vscode.Uri.file(folderPath),
		name: path.basename(folderPath),
		index: 0,
	};
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.stat(filePath);
		return true;
	} catch {
		return false;
	}
}
