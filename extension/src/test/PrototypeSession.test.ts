import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import type {
	ChallengeRepository,
	LoadedChallenge,
} from '../application/Challenge';
import { ChallengeController } from '../application/ChallengeController';
import {
	ChallengeSection,
	PrototypeSession,
	SessionStatus,
} from '../application/PrototypeSession';
import {
	TestCaseStatus,
	TestCategory,
	TestRunMode,
	type TestRunRequest,
	type TestRunResult,
	type TestRunner,
} from '../application/TestRunner';
import { MockTestRunner } from '../infrastructure/MockTestRunner';

suite('PrototypeSession', () => {
	test('fails the first check run without completing the level', async () => {
		const session = createSession();
		await session.start();

		const snapshot = await session.runChecks();

		assert.strictEqual(snapshot.status, SessionStatus.Failed);
		assert.strictEqual(snapshot.challenge?.isCurrentLevelComplete, false);
		assert.strictEqual(snapshot.isEvolutionUnlocked, false);
	});

	test('reports queued, running, and completed check details', async () => {
		const session = createSession();
		await session.start();
		const updates: TestCaseStatus[][] = [];

		const snapshot = await session.runChecks((progressSnapshot) => {
			updates.push(
				progressSnapshot.testProgress?.testCases.map(
					(testCase) => testCase.status,
				) ?? [],
			);
		});

		assert.ok(updates.some((statuses) => statuses.includes(TestCaseStatus.Queued)));
		assert.ok(updates.some((statuses) => statuses.includes(TestCaseStatus.Running)));
		assert.ok(updates.some((statuses) => statuses.includes(TestCaseStatus.Failed)));
		assert.strictEqual(snapshot.latestTestResult?.attempt, 1);
		assert.strictEqual(snapshot.latestTestResult?.testCases.length, 4);
	});

	test('passes a retry and unlocks design reflection', async () => {
		const session = createSession();
		await session.start();
		await session.runChecks();

		const snapshot = await session.runChecks();

		assert.strictEqual(snapshot.status, SessionStatus.Passed);
		assert.strictEqual(snapshot.challenge?.isCurrentLevelComplete, true);
		assert.strictEqual(snapshot.isEvolutionUnlocked, true);
		assert.ok(snapshot.challenge?.currentLevel.designFeedback);
	});

	test('keeps the selected section in session state', async () => {
		const session = createSession();
		await session.start();
		await session.runChecks();
		await session.runChecks();

		const snapshot = session.selectSection(ChallengeSection.Design);

		assert.strictEqual(snapshot.activeSection, ChallengeSection.Design);
	});

	test('requires checks after a refactor before advancing', async () => {
		const session = createSession();
		await session.start();
		await session.runChecks();
		await session.runChecks();
		session.beginRefactor();

		assert.throws(
			() => session.advanceToNextLevel(),
			/Run checks after refactoring/,
		);

		await session.runChecks();
		const snapshot = session.advanceToNextLevel();
		assert.strictEqual(snapshot.challenge?.currentLevelNumber, 2);
	});

	test('restart resets mock attempts', async () => {
		const session = createSession();
		await session.start();
		await session.runChecks();
		await session.runChecks();
		await session.start();

		const snapshot = await session.runChecks();

		assert.strictEqual(snapshot.status, SessionStatus.Failed);
	});

	test('recovers when a test runner rejects', async () => {
		const runner: TestRunner = {
			run: async () => Promise.reject(new Error('Runner unavailable')),
			reset: () => undefined,
		};
		const session = createSession(runner);
		await session.start();

		await assert.rejects(session.runChecks(), /Runner unavailable/);

		assert.strictEqual(session.getSnapshot().status, SessionStatus.Idle);
	});

	test('ignores a stale check result after restarting', async () => {
		const runner = new DeferredTestRunner();
		const session = createSession(runner);
		await session.start();
		const oldRun = session.runChecks();

		await session.start();
		runner.resolveNext(passingResult());
		await oldRun;

		const snapshot = session.getSnapshot();
		assert.strictEqual(snapshot.status, SessionStatus.Idle);
		assert.strictEqual(snapshot.challenge?.isCurrentLevelComplete, false);
	});

	test('blocks progression after a refactor check fails', async () => {
		const runner = new ScriptedTestRunner([
			passingResult(),
			failingResult(),
		]);
		const session = createSession(runner);
		await session.start();
		await session.runChecks();
		session.beginRefactor();

		const snapshot = await session.runChecks();

		assert.strictEqual(snapshot.status, SessionStatus.Failed);
		assert.strictEqual(snapshot.canRevealNext, false);
		assert.throws(
			() => session.advanceToNextLevel(),
			/Run checks after refactoring/,
		);
	});
});

function createSession(
	testRunner: TestRunner = new MockTestRunner(0),
): PrototypeSession {
	const repository: ChallengeRepository = {
		load: async () => createChallenge(),
	};
	const controller = new ChallengeController(repository);

	return new PrototypeSession(controller, testRunner);
}

class ScriptedTestRunner implements TestRunner {
	public constructor(private readonly results: TestRunResult[]) {}

	public async run(_request: TestRunRequest): Promise<TestRunResult> {
		const result = this.results.shift();
		if (!result) {
			throw new Error('No scripted result remains.');
		}

		return result;
	}

	public reset(): void {}
}

class DeferredTestRunner implements TestRunner {
	private resolver: ((result: TestRunResult) => void) | undefined;

	public async run(_request: TestRunRequest): Promise<TestRunResult> {
		return new Promise<TestRunResult>((resolve) => {
			this.resolver = resolve;
		});
	}

	public reset(): void {}

	public resolveNext(result: TestRunResult): void {
		if (!this.resolver) {
			throw new Error('No deferred run is waiting.');
		}

		this.resolver(result);
		this.resolver = undefined;
	}
}

function passingResult(): TestRunResult {
	return {
		passed: true,
		mode: TestRunMode.Simulated,
		attempt: 1,
		durationMilliseconds: 1,
		testCases: [{
			name: 'passes',
			category: TestCategory.Current,
			passed: true,
			durationMilliseconds: 1,
		}],
	};
}

function failingResult(): TestRunResult {
	return {
		passed: false,
		mode: TestRunMode.Simulated,
		attempt: 1,
		durationMilliseconds: 1,
		testCases: [{
			name: 'fails',
			category: TestCategory.Current,
			passed: false,
			durationMilliseconds: 1,
		}],
	};
}

function createChallenge(): LoadedChallenge {
	const levelIds = ['single-term-search', 'prefix-search'];
	const levels = levelIds.map((id, index) => {
		const level = index + 1;
		return {
		manifest: {
			id,
			title: `Level ${level}`,
			sections: [{
				id: 'requirements',
				title: 'What must work',
				contentPath: `level-${level}/requirements.md`,
				display: LevelSectionDisplay.Expanded,
			}],
			designFeedbackPath: `level-${level}/design-feedback.md`,
			testsPath: `level-${level}/tests`,
		},
		sections: [{
			id: 'requirements',
			title: 'What must work',
			display: LevelSectionDisplay.Expanded,
			content: `Level ${level} requirement`,
		}],
		designFeedback: `Level ${level} feedback`,
		testsPath: `/challenge/level-${level}/tests`,
		};
	});

	return {
		manifest: {
			id: 'test-challenge',
			title: 'Test Challenge',
			description: 'A challenge used by session tests.',
			starterPath: 'starter',
			entrypointPath: 'starter/main.py',
			levels: levels.map((level) => level.manifest),
		},
		rootPath: '/challenge',
		starterPath: '/challenge/starter',
		entrypointPath: '/challenge/starter/main.py',
		levels,
	};
}
