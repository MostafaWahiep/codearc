import * as assert from 'node:assert';
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

	test('starts a separate attempt for the injected learner', async () => {
		const backendClient = createBackendClient();
		let request: { userId: string; challengeId: string } | undefined;
		backendClient.startAttempt = async (requestedUserId, requestedChallengeId) => {
			request = {
				userId: requestedUserId,
				challengeId: requestedChallengeId,
			};
			return fullAttempt();
		};
		const catalog = new AttemptCatalog(backendClient, userId);

		const attempt = await catalog.startNew(challengeId);

		assert.deepStrictEqual(request, { userId, challengeId });
		assert.strictEqual(attempt.id, fullAttempt().id);
	});

	test('only continues an attempt loaded for the selected challenge', async () => {
		const backendClient = createBackendClient();
		backendClient.listAttempts = async () => [attemptSummary()];
		backendClient.getAttempt = async () => fullAttempt();
		const catalog = new AttemptCatalog(backendClient, userId);
		await catalog.load(challengeId);

		const attempt = await catalog.continue(attemptSummary().id);
		assert.strictEqual(attempt.id, fullAttempt().id);
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
