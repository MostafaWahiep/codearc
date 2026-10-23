import * as assert from 'node:assert';
import { LevelSectionDisplay } from '@codearc/shared';
import {
	AttemptCatalogStatus,
	type AttemptCatalogSnapshot,
} from '../application/AttemptCatalog';
import type { AttemptSessionSnapshot } from '../application/AttemptSession';
import {
	ChallengeCatalogStatus,
	type ChallengeCatalogSnapshot,
} from '../application/ChallengeCatalog';
import { ChallengeSection } from '../application/ChallengeSection';
import type { MarkdownRenderer } from '../views/MarkdownRenderer';
import { renderChallenge } from '../views/challengeViewContent';
import { createChallengeViewHtml } from '../views/challengeViewHtml';
import { escapeHtml } from '../views/viewFormatting';

const markdownRenderer: MarkdownRenderer = {
	render: async (markdown) => `<div data-rendered-markdown>${escapeHtml(markdown)}</div>`,
};

suite('Challenge view rendering', () => {
	test('assembles the challenge catalog document with styles and behavior', async () => {
		const html = await createChallengeViewHtml(
			markdownRenderer,
			{
				cspSource: 'https://test.webview.example',
				markdownHighlightStylesheetUri: 'https://test.webview.example/highlight.css',
			},
			createCatalogSnapshot(),
		);

		assert.match(html, /Content-Security-Policy/);
		assert.match(html, /style-src 'unsafe-inline' https:\/\/test\.webview\.example/);
		assert.match(html, /acquireVsCodeApi\(\)/);
		assert.match(html, /testPath: button\.dataset\.testPath/);
		assert.match(html, /Build a Search Engine/);
		assert.match(html, /Evolve one search engine/);
		assert.match(html, /3 stages/);
		assert.match(html, /data-challenge-id="search-engine"/);
	});

	test('renders existing attempts and explicit start and continue actions', async () => {
		const html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			createAttemptCatalogSnapshot(),
		);

		assert.match(html, /Your attempts/);
		assert.match(html, /In progress/);
		assert.match(html, /single term search/);
		assert.match(html, /data-action="continueAttempt"/);
		assert.match(html, /data-attempt-id="22222222-2222-4222-8222-222222222222"/);
		assert.match(html, /data-action="startNewAttempt"/);
	});

	test('renders backend requirements and only visible level navigation', async () => {
		const html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			createAttemptSessionSnapshot(),
		);

		assert.match(html, /Build a Search Engine/);
		assert.match(html, /Prefix Search/);
		assert.match(html, /Add prefix matching from the backend\./);
		assert.match(html, /data-level-id="single-term-search"/);
		assert.match(html, /data-level-id="prefix-search"/);
		assert.doesNotMatch(html, /data-level-id="phrase-search"/);
		assert.match(html, /Stage 3 is locked/);
		assert.match(html, /Design · Locked/);
		assert.match(html, /Open challenge folder/);
		assert.match(html, /Run checks/);
		assert.match(html, /Submit solution/);
	});

	test('renders normalized local test evidence', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.selectedSection = ChallengeSection.Results;
		snapshot.testStatus = 'failed';
		snapshot.latestTestEvidence = {
			passed: false,
			passedCount: 1,
			failedCount: 1,
			totalCount: 2,
			failures: [{
				name: 'test_exact',
				levelId: 'single-term-search',
				category: 'regression',
				status: 'failed',
				details: '.codearc/tests/regression/single-term-search/test_search.py::test_exact - AssertionError: assert [] == [\'doc-1\']',
			}],
			testCases: [
				{ name: 'test_prefix', levelId: 'prefix-search', category: 'current', status: 'passed' },
				{ name: 'test_exact', levelId: 'single-term-search', category: 'regression', status: 'failed', details: '.codearc/tests/regression/single-term-search/test_search.py::test_exact - AssertionError: assert [] == [\'doc-1\']' },
			],
			exitCode: 1,
			timedOut: false,
			runnerVersion: 'pytest 9.0.0',
			codeHash: '1234567890abcdef',
			durationMilliseconds: 125,
		};

		const html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.match(html, /Some tests need attention/);
		assert.match(html, /Current requirement/);
		assert.match(html, /Prefix Search/);
		assert.match(html, /All 1 passed/);
		assert.match(html, /1 current tests passed/);
		assert.match(html, /Regression safety net/);
		assert.match(html, /1 previous-level test failed/);
		assert.match(html, /Single Term Search/);
		assert.match(html, /0\/1/);
		assert.match(html, />Prefix</);
		assert.match(html, />Exact</);
		assert.match(html, /title="test_prefix"/);
		assert.match(html, /<span>Expected<\/span><code>\[&#39;doc-1&#39;\]<\/code>/);
		assert.match(html, /<span>Received<\/span><code>\[\]<\/code>/);
		assert.match(html, /data-action="openTestCase"/);
		assert.match(html, /data-test-path="\.codearc\/tests\/regression\/single-term-search\/test_search\.py"/);
		assert.match(html, /data-test-name="test_exact"/);
		assert.match(html, /Open test case/);
		assert.doesNotMatch(html, /Technical details/);
		assert.match(html, /<details class="run-details">/);
		assert.match(html, /pytest 9.0.0/);
		assert.match(html, /1234567890ab/);
	});

	test('reveals backend design feedback for a completed level', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.level.status = 'completed';
		snapshot.level.designFeedback = '# Reflection\n\nConsider an inverted index.';
		snapshot.selectedSection = ChallengeSection.Design;

		const html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.match(html, /Design reflection/);
		assert.match(html, /Consider an inverted index\./);
		assert.doesNotMatch(html, /Design is locked/);
	});

	test('offers the backend current stage after design reflection', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.level.status = 'completed';
		snapshot.level.designFeedback = '# Reflection\n\nConsider an inverted index.';
		snapshot.selectedSection = ChallengeSection.Design;
		snapshot.attempt.activeLevelId = 'phrase-search';
		snapshot.attempt.levels.push({
			levelId: 'phrase-search',
			status: 'active',
			submissionCount: 0,
			completedAt: null,
		});

		let html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.match(html, /data-action="currentStage"/);
		assert.match(html, /Continue to current stage/);

		snapshot.attempt.status = 'completed';
		html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.doesNotMatch(html, /data-action="currentStage"/);
	});

	test('renders submission controls and backend submission state', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.selectedSection = ChallengeSection.Results;

		let html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.match(html, /data-action="submitSolution"/);
		assert.match(html, /Submit solution/);

		snapshot.testStatus = 'passed';
		snapshot.submissionStatus = 'submitting';
		snapshot.latestTestEvidence = passingTestEvidence();
		html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);
		assert.match(html, /Submitting to CodeArc/);
		assert.doesNotMatch(html, /Submit solution/);

		snapshot.submissionStatus = 'rejected';
		snapshot.submissionError = 'The submitted level is stale.';
		html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);
		assert.match(html, /could not accept this submission/);
		assert.match(html, /submitted level is stale/);
	});
});

function passingTestEvidence() {
	return {
		passed: true,
		passedCount: 1,
		failedCount: 0,
		totalCount: 1,
		failures: [],
		testCases: [{
			name: 'test_prefix',
			levelId: 'prefix-search',
			category: 'current' as const,
			status: 'passed' as const,
		}],
		exitCode: 0,
		timedOut: false,
		runnerVersion: 'pytest 9.0.0',
		codeHash: '1234567890abcdef',
		durationMilliseconds: 125,
	};
}

function createCatalogSnapshot(): ChallengeCatalogSnapshot {
	return {
		status: ChallengeCatalogStatus.Ready,
		challenges: [{
			id: 'search-engine',
			version: '1',
			title: 'Build a Search Engine',
			description: 'Evolve one search engine.',
			levelCount: 3,
		}],
	};
}

function createAttemptCatalogSnapshot(): AttemptCatalogSnapshot {
	return {
		status: AttemptCatalogStatus.Ready,
		challengeId: 'search-engine',
		attempts: [{
			id: '22222222-2222-4222-8222-222222222222',
			version: '1',
			status: 'in_progress',
			startedAt: '2026-10-17T12:00:00+00:00',
			updatedAt: '2026-10-17T12:00:00+00:00',
			completedAt: null,
			activeLevelId: 'single-term-search',
		}],
	};
}

function createAttemptSessionSnapshot(): AttemptSessionSnapshot {
	return {
		challenge: createCatalogSnapshot().challenges[0],
		attempt: {
			id: '22222222-2222-4222-8222-222222222222',
			userId: '11111111-1111-4111-8111-111111111111',
			challengeId: 'search-engine',
			version: '1',
			status: 'in_progress',
			startedAt: '2026-10-17T12:00:00+00:00',
			updatedAt: '2026-10-17T12:30:00+00:00',
			completedAt: null,
			activeLevelId: 'prefix-search',
			levels: [
				{ levelId: 'single-term-search', status: 'completed', submissionCount: 2, completedAt: '2026-10-17T12:20:00+00:00' },
				{ levelId: 'prefix-search', status: 'active', submissionCount: 0, completedAt: null },
			],
		},
		level: {
			id: 'prefix-search',
			title: 'Prefix Search',
			status: 'active',
			sections: [{
				id: 'requirements',
				title: 'What must work',
				content: 'Add prefix matching from the backend.',
				display: LevelSectionDisplay.Expanded,
			}],
			designFeedback: null,
		},
		selectedSection: ChallengeSection.Build,
		testStatus: 'idle',
		submissionStatus: 'idle',
		submissionError: undefined,
	};
}
