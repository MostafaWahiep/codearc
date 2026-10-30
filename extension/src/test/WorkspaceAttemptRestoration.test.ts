import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { AttemptCatalog } from '../application/AttemptCatalog';
import { AttemptSession } from '../application/AttemptSession';
import { ChallengeCatalog } from '../application/ChallengeCatalog';
import type { LocalTestRunner } from '../application/LocalTestRunner';
import type { BackendClient } from '../backend/BackendClient';
import type { AttemptDto } from '../backend/BackendTypes';
import { LearnerWorkspaceService } from '../infrastructure/LearnerWorkspaceService';
import { ChallengeViewProvider } from '../views/ChallengeViewProvider';
import type { MarkdownRenderer } from '../views/MarkdownRenderer';

const attemptId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

suite('Workspace attempt restoration', () => {
	let storagePath: string;

	setup(async () => {
		storagePath = await fs.mkdtemp(path.join(os.tmpdir(), 'codearc-restore-'));
	});

	teardown(async () => {
		await fs.rm(storagePath, { recursive: true, force: true });
	});

	test('opens the backend attempt represented by the current folder', async () => {
		const backendClient = createBackendClient();
		const storageRoot = vscode.Uri.file(storagePath);
		const seedWorkspace = new LearnerWorkspaceService(
			storageRoot,
			backendClient,
		);
		await seedWorkspace.createWorkspace(attempt());
		const challengeRoot = path.join(
			storagePath,
			'learner-workspaces',
			attemptId,
			'search-engine',
		);
		const learnerWorkspace = new LearnerWorkspaceService(
			storageRoot,
			backendClient,
			() => [workspaceFolder(challengeRoot)],
		);
		const attemptSession = new AttemptSession(backendClient);
		const provider = new ChallengeViewProvider(
			new ChallengeCatalog(backendClient),
			new AttemptCatalog(backendClient, userId),
			attemptSession,
			learnerWorkspace,
			unusedTestRunner,
			passthroughMarkdownRenderer,
		);

		await provider.restoreOpenedWorkspace();

		const snapshot = attemptSession.getSnapshot();
		assert.strictEqual(snapshot?.attempt.id, attemptId);
		assert.strictEqual(snapshot?.challenge.id, 'search-engine');
		assert.strictEqual(snapshot?.level.id, 'single-term-search');
		assert.strictEqual(
			vscode.window.activeTextEditor?.document.uri.fsPath,
			path.join(challengeRoot, 'search_engine.py'),
		);
	});
});

const unusedTestRunner: LocalTestRunner = {
	run: async () => {
		throw new Error('The test runner is not used while restoring a workspace.');
	},
};

const passthroughMarkdownRenderer: MarkdownRenderer = {
	render: async (markdown) => markdown,
};

function createBackendClient(): BackendClient {
	return {
		listChallenges: async () => [{
			id: 'search-engine',
			version: '1',
			title: 'Build a Search Engine',
			description: 'Evolve a search engine across three levels.',
			levelCount: 3,
		}],
		listAttempts: async () => [],
		startAttempt: async () => attempt(),
		getAttempt: async () => attempt(),
		getVisibleLevel: async () => ({
			id: 'single-term-search',
			title: 'Level 1: Single-Term Search',
			status: 'active',
			sections: [],
			designFeedback: null,
		}),
		getVisibleTests: async () => ({ runner: 'pytest', files: [] }),
		submitTestResults: async () => {
			throw new Error('Not used');
		},
		getStarterFiles: async () => ({
			challengeId: 'search-engine',
			version: '1',
			entrypoint: 'search_engine.py',
			files: [{
				filePath: 'search_engine.py',
				content: 'class SearchEngine:\n    pass\n',
			}],
		}),
	};
}

function attempt(): AttemptDto {
	return {
		id: attemptId,
		userId,
		challengeId: 'search-engine',
		version: '1',
		status: 'in_progress',
		startedAt: '2026-10-24T12:00:00+00:00',
		updatedAt: '2026-10-24T12:00:00+00:00',
		completedAt: null,
		activeLevelId: 'single-term-search',
		levels: [{
			levelId: 'single-term-search',
			status: 'active',
			submissionCount: 0,
			completedAt: null,
		}],
	};
}

function workspaceFolder(folderPath: string): vscode.WorkspaceFolder {
	return {
		uri: vscode.Uri.file(folderPath),
		name: path.basename(folderPath),
		index: 0,
	};
}
