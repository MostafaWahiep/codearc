import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BackendClient } from '../backend/BackendClient';
import type { AttemptDto } from '../backend/BackendTypes';
import { LearnerSourceCollector } from '../infrastructure/LearnerSourceCollector';
import { LearnerWorkspaceService } from '../infrastructure/LearnerWorkspaceService';

suite('LearnerSourceCollector', () => {
	let storagePath: string;

	setup(async () => {
		storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'codearc-source-'));
	});

	teardown(async () => {
		await fs.rm(storagePath, { recursive: true, force: true });
	});

	test('collects learner text files with stable relative paths', async () => {
		const workspaceService = createWorkspaceService(storagePath);
		await workspaceService.createWorkspace(attempt());
		const challengeRoot = challengeRootPath(storagePath);
		await fs.mkdir(path.join(challengeRoot, 'src'), { recursive: true });
		await fs.writeFile(
			path.join(challengeRoot, 'src', 'query.py'),
			'def query():\n    pass\n',
			'utf8',
		);
		await fs.writeFile(path.join(challengeRoot, 'README.md'), '# Search\n', 'utf8');

		const files = await new LearnerSourceCollector(workspaceService).collect(
			attempt(),
		);

		assert.deepStrictEqual(
			files.map((file) => file.path),
			[
				'README.md',
				'helpers/tokenize.py',
				'search_engine.py',
				'src/query.py',
			],
		);
		assert.strictEqual(
			files.find((file) => file.path === 'src/query.py')?.content,
			'def query():\n    pass\n',
		);
	});

	test('excludes internal directories and binary files', async () => {
		const workspaceService = createWorkspaceService(storagePath);
		await workspaceService.createWorkspace(attempt());
		const challengeRoot = challengeRootPath(storagePath);
		const excludedFiles = [
			['.codearc', 'tests', 'test_search.py'],
			['.cache', 'generated.py'],
			['.git', 'config'],
			['.venv', 'pyvenv.cfg'],
			['__pycache__', 'search_engine.pyc'],
			['node_modules', 'package', 'index.js'],
		];
		for (const segments of excludedFiles) {
			const filePath = path.join(challengeRoot, ...segments);
			await fs.mkdir(path.dirname(filePath), { recursive: true });
			await fs.writeFile(filePath, 'not learner source\n', 'utf8');
		}
		await fs.writeFile(path.join(challengeRoot, '.env'), 'SECRET=value\n');
		await fs.writeFile(
			path.join(challengeRoot, 'diagram.png'),
			Buffer.from([0, 255, 1, 2]),
		);

		const files = await new LearnerSourceCollector(workspaceService).collect(
			attempt(),
		);

		assert.deepStrictEqual(
			files.map((file) => file.path),
			['helpers/tokenize.py', 'search_engine.py'],
		);
	});
});

function createWorkspaceService(storagePath: string): LearnerWorkspaceService {
	return new LearnerWorkspaceService(
		vscode.Uri.file(storagePath),
		backendClient(),
	);
}

function backendClient(): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => { throw new Error('Not used'); },
		getAttempt: async () => { throw new Error('Not used'); },
		getVisibleLevel: async () => { throw new Error('Not used'); },
		getLevelChangeImpact: async () => { throw new Error('Not used'); },
		getVisibleTests: async () => ({ runner: 'pytest', files: [] }),
		submitTestResults: async () => { throw new Error('Not used'); },
		createSubmission: async () => { throw new Error('Not used'); },
		getStarterFiles: async () => ({
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
		}),
	};
}

function attempt(): AttemptDto {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		userId: '11111111-1111-4111-8111-111111111111',
		challengeId: 'search-engine',
		version: '1',
		status: 'in_progress',
		startedAt: '2026-11-14T12:00:00+00:00',
		updatedAt: '2026-11-14T12:00:00+00:00',
		completedAt: null,
		activeLevelId: 'single-term-search',
		levels: [],
	};
}

function challengeRootPath(storagePath: string): string {
	return path.join(
		storagePath,
		'22222222-2222-4222-8222-222222222222',
		'search-engine',
	);
}
