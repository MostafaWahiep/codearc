import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import type { OpenedAttempt } from '../application/AttemptCatalog';
import { AttemptSession } from '../application/AttemptSession';
import { ChallengeSection } from '../application/PrototypeSession';
import type { BackendClient } from '../backend/BackendClient';

suite('AttemptSession', () => {
	test('opens the backend attempt on its current level', () => {
		const session = new AttemptSession(createBackendClient());

		const snapshot = session.open(challengeSummary(), openedAttempt());

		assert.strictEqual(snapshot.attempt.id, openedAttempt().attempt.id);
		assert.strictEqual(snapshot.level.id, 'prefix-search');
		assert.strictEqual(snapshot.selectedSection, ChallengeSection.Build);
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
