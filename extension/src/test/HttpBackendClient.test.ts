import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import {
	BackendConnectionError,
	BackendResponseError,
	InvalidBackendResponseError,
} from '../backend/BackendErrors';
import {
	type BackendFetch,
	HttpBackendClient,
} from '../backend/HttpBackendClient';

const backendUrl = 'http://127.0.0.1:5000/api/v1';

suite('HttpBackendClient', () => {
	test('loads and validates challenge summaries', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse([
				{
					id: 'search-engine',
					version: '1',
					title: 'Build a Search Engine',
					description: 'Evolve one search engine.',
					levelCount: 3,
				},
			]);
		});

		const challenges = await client.listChallenges();

		assert.deepStrictEqual(challenges, [
			{
				id: 'search-engine',
				version: '1',
				title: 'Build a Search Engine',
				description: 'Evolve one search engine.',
				levelCount: 3,
			},
		]);
		assert.strictEqual(calls[0].url, `${backendUrl}/challenges`);
		assert.strictEqual(calls[0].init?.method, 'GET');
	});

	test('starts an attempt with a JSON request', async () => {
		let capturedBody: string | undefined;
		const client = createClient(async (_url, init) => {
			capturedBody = init?.body as string | undefined;
			return jsonResponse(attemptResponse());
		});

		const attempt = await client.startAttempt(
			'11111111-1111-4111-8111-111111111111',
			'search-engine',
		);

		assert.strictEqual(attempt.activeLevelId, 'single-term-search');
		assert.deepStrictEqual(JSON.parse(capturedBody ?? ''), {
			userId: '11111111-1111-4111-8111-111111111111',
			challengeId: 'search-engine',
		});
	});

	test('lists a learner\'s attempts for a challenge', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse([attemptSummaryResponse()]);
		});

		const attempts = await client.listAttempts(
			'11111111-1111-4111-8111-111111111111',
			'search engine',
		);

		assert.deepStrictEqual(attempts, [attemptSummaryResponse()]);
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts?userId=11111111-1111-4111-8111-111111111111&challengeId=search+engine`,
		);
		assert.strictEqual(calls[0].init?.method, 'GET');
	});

	test('retrieves an attempt by ID', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse(attemptResponse());
		});

		const attempt = await client.getAttempt(
			'22222222-2222-4222-8222-222222222222',
		);

		assert.strictEqual(attempt.challengeId, 'search-engine');
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts/22222222-2222-4222-8222-222222222222`,
		);
		assert.strictEqual(calls[0].init?.method, 'GET');
	});

	test('loads and validates a visible level for an attempt', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse(visibleLevelResponse());
		});

		const level = await client.getVisibleLevel(
			'22222222-2222-4222-8222-222222222222',
			'single term search',
		);

		assert.strictEqual(level.id, 'single-term-search');
		assert.strictEqual(level.sections[0].display, LevelSectionDisplay.Expanded);
		assert.strictEqual(level.designFeedback, null);
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts/22222222-2222-4222-8222-222222222222/levels/single%20term%20search`,
		);
		assert.strictEqual(calls[0].init?.method, 'GET');
	});

	test('loads visible public tests for an attempt', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse({
				runner: 'pytest',
				files: [
					{
						levelId: 'single-term-search',
						path: 'test_search.py',
						content: 'def test_search(): pass',
						category: 'current',
					},
				],
			});
		});

		const bundle = await client.getVisibleTests(
			'22222222-2222-4222-8222-222222222222',
		);

		assert.strictEqual(bundle.runner, 'pytest');
		assert.strictEqual(bundle.files[0].category, 'current');
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts/22222222-2222-4222-8222-222222222222/tests`,
		);
	});

	test('surfaces the server error message and status', async () => {
		const client = createClient(async () => jsonResponse(
			{ message: "Challenge 'unknown' was not found" },
			404,
		));

		await assert.rejects(
			client.startAttempt(
				'11111111-1111-4111-8111-111111111111',
				'unknown',
			),
			(error: unknown) => {
				assert.ok(error instanceof BackendResponseError);
				assert.strictEqual(error.status, 404);
				assert.match(error.message, /Challenge 'unknown'/);
				return true;
			},
		);
	});

	test('turns network failures into an actionable connection error', async () => {
		const client = createClient(async () => {
			throw new Error('connect ECONNREFUSED');
		});

		await assert.rejects(
			client.listChallenges(),
			(error: unknown) => {
				assert.ok(error instanceof BackendConnectionError);
				assert.match(error.message, /Make sure the backend is running/);
				return true;
			},
		);
	});

	test('rejects a response that does not match the API contract', async () => {
		const client = createClient(async () => jsonResponse([
			{
				id: 'search-engine',
				version: '1',
				title: 'Build a Search Engine',
				description: 'Evolve one search engine.',
			},
		]));

		await assert.rejects(
			client.listChallenges(),
			(error: unknown) => {
				assert.ok(error instanceof InvalidBackendResponseError);
				assert.match(error.message, /response\[0\]\.levelCount/);
				return true;
			},
		);
	});

	test('rejects an attempt without an active level ID', async () => {
		const response = attemptResponse();
		response.activeLevelId = null;
		const client = createClient(async () => jsonResponse(response));

		await assert.rejects(
			client.getAttempt('22222222-2222-4222-8222-222222222222'),
			(error: unknown) => {
				assert.ok(error instanceof InvalidBackendResponseError);
				assert.match(error.message, /response\.activeLevelId/);
				return true;
			},
		);
	});

	test('rejects an unknown level-section display mode', async () => {
		const response = visibleLevelResponse();
		const sections = response.sections as Array<Record<string, unknown>>;
		sections[0].display = 'always-open';
		const client = createClient(async () => jsonResponse(response));

		await assert.rejects(
			client.getVisibleLevel(
				'22222222-2222-4222-8222-222222222222',
				'single-term-search',
			),
			(error: unknown) => {
				assert.ok(error instanceof InvalidBackendResponseError);
				assert.match(error.message, /response\.sections\[0\]\.display/);
				return true;
			},
		);
	});
});

function createClient(fetcher: BackendFetch): HttpBackendClient {
	return new HttpBackendClient(backendUrl, fetcher);
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function attemptResponse(): Record<string, unknown> {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		userId: '11111111-1111-4111-8111-111111111111',
		challengeId: 'search-engine',
		version: '1',
		status: 'in_progress',
		startedAt: '2026-10-17T12:00:00+00:00',
		updatedAt: '2026-10-17T12:00:00+00:00',
		completedAt: null,
		activeLevelId: 'single-term-search',
		levels: [
			{
				levelId: 'single-term-search',
				status: 'active',
				submissionCount: 0,
				completedAt: null,
			},
		],
	};
}

function attemptSummaryResponse(): Record<string, unknown> {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		version: '1',
		status: 'in_progress',
		startedAt: '2026-10-17T12:00:00+00:00',
		updatedAt: '2026-10-17T12:00:00+00:00',
		completedAt: null,
		activeLevelId: 'single-term-search',
	};
}

function visibleLevelResponse(): Record<string, unknown> {
	return {
		id: 'single-term-search',
		title: 'Level 1: Single-Term Search',
		status: 'active',
		sections: [
			{
				id: 'api',
				title: 'Public API',
				content: '## SearchEngine',
				display: 'expanded',
			},
		],
		designFeedback: null,
	};
}
