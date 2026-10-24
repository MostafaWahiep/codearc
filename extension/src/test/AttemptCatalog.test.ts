import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import {
	AttemptCatalog,
	AttemptCatalogStatus,
} from '../application/AttemptCatalog';
import type { BackendClient } from '../backend/BackendClient';

const userId = '11111111-1111-4111-8111-111111111111';
const challengeId = 'search-engine';

suite('AttemptCatalog', () => {
	test('loads attempts for the injected learner and selected challenge', async () => {
		const requests: Array<{ userId: string; challengeId: string }> = [];
		const backendClient = createBackendClient();
		backendClient.listAttempts = async (requestedUserId, requestedChallengeId) => {
			requests.push({
				userId: requestedUserId,
				challengeId: requestedChallengeId,
			});
			return [attemptSummary()];
		};
		const catalog = new AttemptCatalog(backendClient, userId);

		const load = catalog.load(challengeId);
		assert.strictEqual(catalog.getSnapshot().status, AttemptCatalogStatus.Loading);

		const snapshot = await load;

		assert.deepStrictEqual(requests, [{ userId, challengeId }]);
		assert.strictEqual(snapshot.status, AttemptCatalogStatus.Ready);
		assert.strictEqual(snapshot.attempts[0].id, attemptSummary().id);
	});

	test('starts an attempt and opens its current visible level', async () => {
		const backendClient = createBackendClient();
		let request: { userId: string; challengeId: string } | undefined;
		const levelRequests: Array<{ attemptId: string; levelId: string }> = [];
		backendClient.startAttempt = async (requestedUserId, requestedChallengeId) => {
			request = {
				userId: requestedUserId,
				challengeId: requestedChallengeId,
			};
			return fullAttempt();
		};
		backendClient.getVisibleLevel = async (attemptId, levelId) => {
			levelRequests.push({ attemptId, levelId });
			return visibleLevel();
		};
		const catalog = new AttemptCatalog(backendClient, userId);

		const opened = await catalog.startNew(challengeId);

		assert.deepStrictEqual(request, { userId, challengeId });
		assert.deepStrictEqual(levelRequests, [
			{
				attemptId: fullAttempt().id,
				levelId: fullAttempt().activeLevelId,
			},
		]);
		assert.strictEqual(opened.attempt.id, fullAttempt().id);
		assert.strictEqual(opened.level.id, visibleLevel().id);
	});

	test('continues a listed attempt and opens its current visible level', async () => {
		const backendClient = createBackendClient();
		backendClient.listAttempts = async () => [attemptSummary()];
		backendClient.getAttempt = async () => fullAttempt();
		backendClient.getVisibleLevel = async () => visibleLevel();
		const catalog = new AttemptCatalog(backendClient, userId);
		await catalog.load(challengeId);

		const opened = await catalog.continue(attemptSummary().id);
		assert.strictEqual(opened.attempt.id, fullAttempt().id);
		assert.strictEqual(opened.level.id, visibleLevel().id);
		await assert.rejects(
			catalog.continue('33333333-3333-4333-8333-333333333333'),
			/Choose one of the listed attempts/,
		);
	});
});

function createBackendClient(): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => fullAttempt(),
		getAttempt: async () => fullAttempt(),
		getVisibleLevel: async () => {
			throw new Error('Not implemented by this test fake.');
		},
		getVisibleTests: async () => ({ runner: 'pytest', files: [] }),
		submitTestResults: async () => ({
			outcome: 'tests_failed',
			attempt: fullAttempt(),
			completedLevelId: null,
		}),
		getStarterFiles: async () => {
			throw new Error('Not implemented by this test fake.');
		},
	};
}

function attemptSummary() {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		version: '1',
		status: 'in_progress' as const,
		startedAt: '2026-10-17T12:00:00+00:00',
		updatedAt: '2026-10-17T12:00:00+00:00',
		completedAt: null,
		activeLevelId: 'single-term-search',
	};
}

function fullAttempt() {
	return {
		...attemptSummary(),
		userId,
		challengeId,
		levels: [
			{
				levelId: 'single-term-search',
				status: 'active' as const,
				submissionCount: 0,
				completedAt: null,
			},
		],
	};
}

function visibleLevel() {
	return {
		id: 'single-term-search',
		title: 'Level 1: Single-Term Search',
		status: 'active' as const,
		sections: [
			{
				id: 'api',
				title: 'Public API',
				content: '## SearchEngine',
				display: LevelSectionDisplay.Expanded,
			},
		],
		designFeedback: null,
	};
}
