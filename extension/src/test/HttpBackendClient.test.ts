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

	test('loads and validates change impact for a completed level', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse(changeImpactResponse('prefix search'));
		});

		const impact = await client.getLevelChangeImpact(
			'22222222-2222-4222-8222-222222222222',
			'prefix search',
		);

		assert.strictEqual(impact.summary.changedFileCount, 1);
		assert.strictEqual(impact.summary.modifiedMethodCount, 1);
		assert.strictEqual(impact.summary.changedLineCount, 4);
		assert.deepStrictEqual(
			impact.files[0].addedMethods,
			['SearchEngine.search_prefix'],
		);
		assert.strictEqual(
			impact.files[0].modifiedMethods[0].qualifiedName,
			'SearchEngine.add_document',
		);
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts/22222222-2222-4222-8222-222222222222/levels/prefix%20search/change-impact`,
		);
		assert.strictEqual(calls[0].init?.method, 'GET');
	});

	test('rejects malformed change-impact responses', async () => {
		const response = changeImpactResponse();
		const files = response.files as Array<Record<string, unknown>>;
		const methods = files[0].modifiedMethods as Array<Record<string, unknown>>;
		methods[0].linesAdded = -1;
		const client = createClient(async () => jsonResponse(response));

		await assert.rejects(
			client.getLevelChangeImpact(
				'22222222-2222-4222-8222-222222222222',
				'prefix-search',
			),
			(error: unknown) => {
				assert.ok(error instanceof InvalidBackendResponseError);
				assert.match(
					error.message,
					/response\.files\[0\]\.modifiedMethods\[0\]\.linesAdded/,
				);
				return true;
			},
		);
	});

	test('surfaces unavailable change impact as a server response error', async () => {
		const client = createClient(async () => jsonResponse(
			{ message: 'The first level has no previous level to compare.' },
			409,
		));

		await assert.rejects(
			client.getLevelChangeImpact(
				'22222222-2222-4222-8222-222222222222',
				'single-term-search',
			),
			(error: unknown) => {
				assert.ok(error instanceof BackendResponseError);
				assert.strictEqual(error.status, 409);
				assert.match(error.message, /no previous level/);
				return true;
			},
		);
	});

	test('reports connection failures while loading change impact', async () => {
		const client = createClient(async () => {
			throw new Error('connect ECONNREFUSED');
		});

		await assert.rejects(
			client.getLevelChangeImpact(
				'22222222-2222-4222-8222-222222222222',
				'prefix-search',
			),
			(error: unknown) => {
				assert.ok(error instanceof BackendConnectionError);
				assert.match(error.message, /Make sure the backend is running/);
				return true;
			},
		);
	});

	test('loads starter files for an exact challenge release', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse(starterFilesResponse());
		});

		const starterFiles = await client.getStarterFiles(
			'search engine',
			'1 beta',
		);

		assert.deepStrictEqual(
			starterFiles,
			starterFilesResponse('search engine', '1 beta'),
		);
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/challenges/search%20engine/starter-files?version=1+beta`,
		);
		assert.strictEqual(calls[0].init?.method, 'GET');
	});

	test('rejects starter files for a different challenge release', async () => {
		const client = createClient(async () => jsonResponse(
			starterFilesResponse('search-engine', '2'),
		));

		await assert.rejects(
			client.getStarterFiles('search-engine', '1'),
			(error: unknown) => {
				assert.ok(error instanceof InvalidBackendResponseError);
				assert.match(error.message, /requested challenge release/);
				return true;
			},
		);
	});

	test('submits local test results and returns backend-approved progression', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const updatedAttempt = attemptResponse();
		updatedAttempt.activeLevelId = 'prefix-search';
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse({
				outcome: 'level_completed',
				attempt: updatedAttempt,
				completedLevelId: 'single-term-search',
			});
		});

		const result = await client.submitTestResults(
			'22222222-2222-4222-8222-222222222222',
			'33333333-3333-4333-8333-333333333333',
			{
				levelId: 'single-term-search',
				exitCode: 0,
				timedOut: false,
				passedCount: 6,
				failedCount: 0,
			},
		);

		assert.strictEqual(result.outcome, 'level_completed');
		assert.strictEqual(result.completedLevelId, 'single-term-search');
		assert.strictEqual(result.attempt.activeLevelId, 'prefix-search');
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts/22222222-2222-4222-8222-222222222222/test-results`,
		);
		assert.strictEqual(calls[0].init?.method, 'POST');
		assert.deepStrictEqual(
			JSON.parse(calls[0].init?.body as string),
			{
				submissionId: '33333333-3333-4333-8333-333333333333',
				levelId: 'single-term-search',
				exitCode: 0,
				timedOut: false,
				passedCount: 6,
				failedCount: 0,
			},
		);
	});

	test('creates a source submission for an attempt', async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = createClient(async (url, init) => {
			calls.push({ url, init });
			return jsonResponse({
				id: '33333333-3333-4333-8333-333333333333',
				attemptId: '22222222-2222-4222-8222-222222222222',
				levelId: 'single-term-search',
				sequenceNumber: 1,
				status: 'received',
				createdAt: '2026-11-14T12:00:00+00:00',
				startedAt: null,
				completedAt: null,
			});
		});

		const submission = await client.createSubmission(
			'22222222-2222-4222-8222-222222222222',
			[
				{
					path: 'search_engine.py',
					content: 'class SearchEngine:\n    pass\n',
				},
			],
		);

		assert.strictEqual(submission.sequenceNumber, 1);
		assert.strictEqual(submission.status, 'received');
		assert.strictEqual(
			calls[0].url,
			`${backendUrl}/attempts/22222222-2222-4222-8222-222222222222/submissions`,
		);
		assert.strictEqual(calls[0].init?.method, 'POST');
		assert.deepStrictEqual(
			JSON.parse(calls[0].init?.body as string),
			{
				files: [
					{
						path: 'search_engine.py',
						content: 'class SearchEngine:\n    pass\n',
					},
				],
			},
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

function starterFilesResponse(
	challengeId = 'search engine',
	version = '1 beta',
): Record<string, unknown> {
	return {
		challengeId,
		version,
		entrypoint: 'search_engine.py',
		files: [
			{
				filePath: 'helpers/tokenize.py',
				content: 'def tokenize(text):\n    return text.split()\n',
			},
			{
				filePath: 'search_engine.py',
				content: 'class SearchEngine:\n    pass\n',
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

function changeImpactResponse(
	levelId = 'prefix-search',
): Record<string, unknown> {
	return {
		levelId,
		summary: {
			changedFileCount: 1,
			modifiedMethodCount: 1,
			changedLineCount: 4,
		},
		files: [
			{
				path: 'search_engine.py',
				addedMethods: ['SearchEngine.search_prefix'],
				removedMethods: [],
				modifiedMethods: [
					{
						qualifiedName: 'SearchEngine.add_document',
						linesAdded: 3,
						linesRemoved: 1,
						changedLineCount: 4,
					},
				],
			},
		],
	};
}
