import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import type { OpenedAttempt } from '../application/AttemptCatalog';
import { AttemptSession } from '../application/AttemptSession';
import { ChallengeSection } from '../application/ChallengeSection';
import type { TestEvidence } from '../application/LocalTestRunner';
import type { BackendClient } from '../backend/BackendClient';
import type {
	AttemptDto,
	TestSubmission,
	TestSubmissionResultDto,
} from '../backend/BackendTypes';

suite('AttemptSession', () => {
	test('opens the backend attempt on its current level', () => {
		const session = new AttemptSession(createBackendClient());

		const snapshot = session.open(challengeSummary(), openedAttempt());

		assert.strictEqual(snapshot.attempt.id, openedAttempt().attempt.id);
		assert.strictEqual(snapshot.level.id, 'prefix-search');
		assert.strictEqual(snapshot.selectedSection, ChallengeSection.Build);
		assert.strictEqual(snapshot.testStatus, 'idle');
	});

	test('tracks a normalized local test run', () => {
		const session = new AttemptSession(createBackendClient());
		session.open(challengeSummary(), openedAttempt());

		const running = session.startTestRun();
		const complete = session.completeTestRun({
			passed: true,
			passedCount: 1,
			failedCount: 0,
			totalCount: 1,
			failures: [],
			testCases: [
				{
					name: 'test_prefix',
					levelId: 'prefix-search',
					category: 'current',
					status: 'passed',
				},
			],
			exitCode: 0,
			timedOut: false,
			runnerVersion: 'pytest 9.0.0',
			codeHash: 'abc123',
			durationMilliseconds: 40,
		});

		assert.strictEqual(running.testStatus, 'running');
		assert.strictEqual(running.selectedSection, ChallengeSection.Results);
		assert.strictEqual(complete.testStatus, 'passed');
		assert.strictEqual(complete.latestTestEvidence?.codeHash, 'abc123');
	});

	test('maps passing local evidence to a backend submission', () => {
		const session = new AttemptSession(createBackendClient());
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());

		const submission = session.createTestSubmission();

		assert.deepStrictEqual(submission, {
			levelId: 'prefix-search',
			exitCode: 0,
			timedOut: false,
			passedCount: 1,
			failedCount: 0,
		});
	});

	test('rejects submission before tests have run', () => {
		const session = new AttemptSession(createBackendClient());
		session.open(challengeSummary(), openedAttempt());

		assert.throws(
			() => session.createTestSubmission(),
			/No test evidence available/,
		);
	});

	test('maps failed local evidence to a backend submission', () => {
		const session = new AttemptSession(createBackendClient());
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence({
			passed: false,
			passedCount: 0,
			failedCount: 1,
			exitCode: 1,
		}));

		assert.deepStrictEqual(session.createTestSubmission(), {
			levelId: 'prefix-search',
			exitCode: 1,
			timedOut: false,
			passedCount: 0,
			failedCount: 1,
		});
	});

	test('rejects passing evidence without a process exit code', () => {
		const session = new AttemptSession(createBackendClient());
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence({ exitCode: null }));

		assert.throws(
			() => session.createTestSubmission(),
			/Test evidence must include an exit code/,
		);
	});

	test('submits mapped evidence and replaces the attempt with backend state', async () => {
		let request: { attemptId: string; submission: TestSubmission } | undefined;
		const loadedLevels: string[] = [];
		const backendClient = createBackendClient();
		backendClient.submitTestResults = async (attemptId, submission) => {
			request = { attemptId, submission };
			return completedLevelResult();
		};
		backendClient.getVisibleLevel = async (_attemptId, levelId) => {
			loadedLevels.push(levelId);
			return visibleLevel(
				levelId,
				levelId === 'prefix-search' ? 'completed' : 'active',
			);
		};
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());

		const snapshot = await session.submitTestResults();

		assert.deepStrictEqual(request, {
			attemptId: '22222222-2222-4222-8222-222222222222',
			submission: {
				levelId: 'prefix-search',
				exitCode: 0,
				timedOut: false,
				passedCount: 1,
				failedCount: 0,
			},
		});
		assert.strictEqual(snapshot.submissionStatus, 'accepted');
		assert.strictEqual(snapshot.attempt.activeLevelId, 'phrase-search');
		assert.strictEqual(snapshot.level.id, 'prefix-search');
		assert.strictEqual(snapshot.selectedSection, ChallengeSection.Design);
		assert.strictEqual(snapshot.latestTestEvidence, undefined);
		assert.deepStrictEqual(loadedLevels, ['prefix-search']);
		assert.strictEqual(snapshot.submissionError, undefined);

		const currentStage = await session.moveToCurrentStage();

		assert.strictEqual(currentStage.level.id, 'phrase-search');
		assert.strictEqual(currentStage.selectedSection, ChallengeSection.Build);
		assert.deepStrictEqual(loadedLevels, ['prefix-search', 'phrase-search']);
	});

	test('keeps failed submission evidence on the current level', async () => {
		let levelRequestCount = 0;
		const backendClient = createBackendClient();
		backendClient.getVisibleLevel = async () => {
			levelRequestCount += 1;
			return visibleLevel('prefix-search', 'active');
		};
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence({
			passed: false,
			passedCount: 0,
			failedCount: 1,
			exitCode: 1,
		}));

		const snapshot = await session.submitTestResults();

		assert.strictEqual(snapshot.submissionStatus, 'accepted');
		assert.strictEqual(snapshot.level.id, 'prefix-search');
		assert.strictEqual(snapshot.testStatus, 'failed');
		assert.ok(snapshot.latestTestEvidence);
		assert.strictEqual(levelRequestCount, 0);
	});

	test('opens final design feedback when the challenge is completed', async () => {
		const backendClient = createBackendClient();
		backendClient.submitTestResults = async () => completedAttemptResult();
		backendClient.getVisibleLevel = async (_attemptId, levelId) =>
			visibleLevel(levelId, 'completed');
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());

		const snapshot = await session.submitTestResults();

		assert.strictEqual(snapshot.attempt.status, 'completed');
		assert.strictEqual(snapshot.level.status, 'completed');
		assert.strictEqual(snapshot.level.designFeedback, 'Review the tradeoffs.');
		assert.strictEqual(snapshot.selectedSection, ChallengeSection.Design);
	});

	test('exposes submitting state while the backend request is pending', async () => {
		const pending = deferred<TestSubmissionResultDto>();
		const backendClient = createBackendClient();
		backendClient.submitTestResults = async () => pending.promise;
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());

		const submission = session.submitTestResults();

		assert.strictEqual(session.getSnapshot()?.submissionStatus, 'submitting');
		pending.resolve(completedLevelResult());
		assert.strictEqual((await submission).submissionStatus, 'accepted');
	});

	test('preserves attempt state and records backend rejection', async () => {
		const backendClient = createBackendClient();
		backendClient.submitTestResults = async () => {
			throw new Error('The submitted level is stale.');
		};
		const session = new AttemptSession(backendClient);
		const original = session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());

		await assert.rejects(
			session.submitTestResults(),
			/The submitted level is stale/,
		);

		const snapshot = session.getSnapshot();
		assert.strictEqual(snapshot?.submissionStatus, 'rejected');
		assert.strictEqual(
			snapshot?.submissionError,
			'The submitted level is stale.',
		);
		assert.strictEqual(
			snapshot?.attempt.activeLevelId,
			original.attempt.activeLevelId,
		);
	});

	test('rejects a concurrent submission while one is pending', async () => {
		const pending = deferred<TestSubmissionResultDto>();
		const backendClient = createBackendClient();
		backendClient.submitTestResults = async () => pending.promise;
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());
		const firstSubmission = session.submitTestResults();

		await assert.rejects(
			session.submitTestResults(),
			/A CodeArc submission is already in progress/,
		);

		pending.resolve(completedLevelResult());
		await firstSubmission;
	});

	test('rejects a new test run while a submission is pending', async () => {
		const pending = deferred<TestSubmissionResultDto>();
		const backendClient = createBackendClient();
		backendClient.submitTestResults = async () => pending.promise;
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.completeTestRun(testEvidence());
		const submission = session.submitTestResults();

		assert.throws(
			() => session.startTestRun(),
			/A CodeArc submission is already in progress/,
		);

		pending.resolve(completedLevelResult());
		await submission;
	});

	test('loads another level already visible in the attempt', async () => {
		const requests: Array<{ attemptId: string; levelId: string }> = [];
		const backendClient = createBackendClient();
		backendClient.getVisibleLevel = async (attemptId, levelId) => {
			requests.push({ attemptId, levelId });
			return visibleLevel(levelId, 'completed');
		};
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());
		session.selectSection(ChallengeSection.Results);

		const snapshot = await session.selectLevel('single-term-search');

		assert.deepStrictEqual(requests, [
			{
				attemptId: openedAttempt().attempt.id,
				levelId: 'single-term-search',
			},
		]);
		assert.strictEqual(snapshot.level.id, 'single-term-search');
		assert.strictEqual(snapshot.selectedSection, ChallengeSection.Build);
	});

	test('rejects future levels before making a backend request', async () => {
		let requestCount = 0;
		const backendClient = createBackendClient();
		backendClient.getVisibleLevel = async () => {
			requestCount += 1;
			return visibleLevel('phrase-search', 'active');
		};
		const session = new AttemptSession(backendClient);
		session.open(challengeSummary(), openedAttempt());

		await assert.rejects(
			session.selectLevel('phrase-search'),
			/Choose a level already visible/,
		);
		assert.strictEqual(requestCount, 0);
	});

	test('rejects an opened level that does not match the attempt cursor', () => {
		const session = new AttemptSession(createBackendClient());
		const opened = openedAttempt();
		opened.level = visibleLevel('single-term-search', 'completed');

		assert.throws(
			() => session.open(challengeSummary(), opened),
			/wrong current level/,
		);
	});
});

function createBackendClient(): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => openedAttempt().attempt,
		getAttempt: async () => openedAttempt().attempt,
		getVisibleLevel: async (_attemptId, levelId) =>
			visibleLevel(levelId, 'active'),
		getVisibleTests: async () => ({ runner: 'pytest', files: [] }),
		submitTestResults: async () => ({
			outcome: 'tests_failed',
			attempt: openedAttempt().attempt,
			completedLevelId: null,
		}),
		getStarterFiles: async () => {
			throw new Error('Not implemented by this test fake.');
		},
	};
}

function challengeSummary() {
	return {
		id: 'search-engine',
		version: '1',
		title: 'Build a Search Engine',
		description: 'Evolve one search engine.',
		levelCount: 3,
	};
}

function openedAttempt(): OpenedAttempt {
	return {
		attempt: {
			id: '22222222-2222-4222-8222-222222222222',
			userId: '11111111-1111-4111-8111-111111111111',
			challengeId: 'search-engine',
			version: '1',
			status: 'in_progress',
			startedAt: '2026-10-17T12:00:00+00:00',
			updatedAt: '2026-10-17T12:00:00+00:00',
			completedAt: null,
			activeLevelId: 'prefix-search',
			levels: [
				{
					levelId: 'single-term-search',
					status: 'completed',
					submissionCount: 2,
					completedAt: '2026-10-17T12:30:00+00:00',
				},
				{
					levelId: 'prefix-search',
					status: 'active',
					submissionCount: 0,
					completedAt: null,
				},
			],
		},
		level: visibleLevel('prefix-search', 'active'),
	};
}

function visibleLevel(
	id: string,
	status: 'active' | 'completed',
) {
	return {
		id,
		title: id === 'prefix-search' ? 'Prefix Search' : 'Single-Term Search',
		status,
		sections: [
			{
				id: 'requirements',
				title: 'What must work',
				content: 'Implement the requirement.',
				display: LevelSectionDisplay.Expanded,
			},
		],
		designFeedback: status === 'completed' ? 'Review the tradeoffs.' : null,
	};
}

function testEvidence(
	overrides: Partial<TestEvidence> = {},
): TestEvidence {
	return {
		passed: true,
		passedCount: 1,
		failedCount: 0,
		totalCount: 1,
		failures: [],
		testCases: [
			{
				name: 'test_prefix',
				levelId: 'prefix-search',
				category: 'current',
				status: 'passed',
			},
		],
		exitCode: 0,
		timedOut: false,
		runnerVersion: 'pytest 9.0.0',
		codeHash: 'abc123',
		durationMilliseconds: 40,
		...overrides,
	};
}

function completedLevelResult(): TestSubmissionResultDto {
	const attempt = openedAttempt().attempt;
	const completedPrefix = {
		...attempt.levels[1],
		status: 'completed' as const,
		completedAt: '2026-10-17T13:00:00+00:00',
	};
	const updatedAttempt: AttemptDto = {
		...attempt,
		updatedAt: '2026-10-17T13:00:00+00:00',
		activeLevelId: 'phrase-search',
		levels: [
			attempt.levels[0],
			completedPrefix,
			{
				levelId: 'phrase-search',
				status: 'active',
				submissionCount: 0,
				completedAt: null,
			},
		],
	};
	return {
		outcome: 'level_completed',
		attempt: updatedAttempt,
		completedLevelId: 'prefix-search',
	};
}

function completedAttemptResult(): TestSubmissionResultDto {
	const attempt = openedAttempt().attempt;
	return {
		outcome: 'attempt_completed',
		attempt: {
			...attempt,
			status: 'completed',
			completedAt: '2026-10-17T13:00:00+00:00',
			levels: attempt.levels.map((level) => ({
				...level,
				status: 'completed',
				completedAt: level.completedAt ?? '2026-10-17T13:00:00+00:00',
			})),
		},
		completedLevelId: 'prefix-search',
	};
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
} {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}
