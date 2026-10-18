import * as assert from 'node:assert';
import {
	ChallengeCatalog,
	ChallengeCatalogStatus,
} from '../application/ChallengeCatalog';
import type { BackendClient } from '../backend/BackendClient';

suite('ChallengeCatalog', () => {
	test('loads challenge summaries from the backend', async () => {
		const backendClient = createBackendClient();
		backendClient.listChallenges = async () => [
			{
				id: 'search-engine',
				version: '1',
				title: 'Build a Search Engine',
				description: 'Evolve one search engine.',
				levelCount: 3,
			},
		];
		const catalog = new ChallengeCatalog(backendClient);

		const load = catalog.load();
		assert.strictEqual(
			catalog.getSnapshot().status,
			ChallengeCatalogStatus.Loading,
		);

		const snapshot = await load;

		assert.strictEqual(snapshot.status, ChallengeCatalogStatus.Ready);
		assert.strictEqual(snapshot.challenges[0].id, 'search-engine');
	});

	test('keeps a failed backend request in renderable state', async () => {
		const backendClient = createBackendClient();
		backendClient.listChallenges = async () => {
			throw new Error('Backend unavailable');
		};
		const catalog = new ChallengeCatalog(backendClient);

		const snapshot = await catalog.load();

		assert.strictEqual(snapshot.status, ChallengeCatalogStatus.Failed);
		assert.strictEqual(snapshot.errorMessage, 'Backend unavailable');
		assert.deepStrictEqual(snapshot.challenges, []);
	});
});

function createBackendClient(): BackendClient {
	return {
		listChallenges: async () => [],
		listAttempts: async () => [],
		startAttempt: async () => {
			throw new Error('Not implemented by this test fake.');
		},
		getAttempt: async () => {
			throw new Error('Not implemented by this test fake.');
		},
		getVisibleLevel: async () => {
			throw new Error('Not implemented by this test fake.');
		},
		getVisibleTests: async () => ({ runner: 'pytest', files: [] }),
	};
}
