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
			outcome: 'test_failures',
			passedCount: 1,
			failedCount: 1,
			totalCount: 2,
			failures: [{
				name: 'test_exact',
				testPath: '.codearc/tests/regression/single-term-search/test_search.py',
				levelId: 'single-term-search',
				category: 'regression',
				status: 'failed',
				message: 'AssertionError: assert [] == [\'doc-1\']\n  Right contains one more item: \'doc-1\'\n  Use -v to get more diff',
				comparison: { received: '[]', expected: '[\'doc-1\']' },
				stdout: 'indexed <doc-1>\n',
			}],
			testCases: [
				{
					name: 'test_prefix',
					levelId: 'prefix-search',
					category: 'current',
					status: 'passed',
					stdout: 'hidden passing output',
				},
				{
					name: 'test_exact',
					testPath: '.codearc/tests/regression/single-term-search/test_search.py',
					levelId: 'single-term-search',
					category: 'regression',
					status: 'failed',
					message: 'AssertionError: assert [] == [\'doc-1\']\n  Right contains one more item: \'doc-1\'\n  Use -v to get more diff',
					comparison: { received: '[]', expected: '[\'doc-1\']' },
					stdout: 'indexed <doc-1>\n',
				},
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
		assert.match(html, /<span>Output<\/span><code>indexed &lt;doc-1&gt;\n<\/code>/);
		assert.doesNotMatch(html, /hidden passing output/);
		assert.match(html, /data-action="openTestCase"/);
		assert.match(html, /data-test-path="\.codearc\/tests\/regression\/single-term-search\/test_search\.py"/);
		assert.match(html, /data-test-name="test_exact"/);
		assert.match(html, /Open test case/);
		assert.doesNotMatch(html, /<summary>Details<\/summary>/);
		assert.match(html, /<details class="run-details">/);
		assert.match(html, /pytest 9.0.0/);
		assert.match(html, /1234567890ab/);
	});

	test('renders learner collection errors separately from failed tests', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.selectedSection = ChallengeSection.Results;
		snapshot.testStatus = 'failed';
		snapshot.latestTestEvidence = {
			outcome: 'code_error',
			passedCount: 0,
			failedCount: 0,
			totalCount: 0,
			failures: [],
			testCases: [],
			runError: {
				message: 'AssertionError',
				details: 'search_engine.py:4: in <module>\nE   AssertionError',
				sourcePath: 'search_engine.py',
				sourceLine: 4,
			},
			exitCode: 2,
			timedOut: false,
			runnerVersion: 'pytest 9.0.0',
			codeHash: '1234567890abcdef',
			durationMilliseconds: 607,
		};

		const html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.match(html, /Your code could not be loaded/);
		assert.match(html, /0 tests run/);
		assert.match(html, /No tests ran\. Pytest stopped while loading your code\./);
		assert.match(html, /<dt>Error<\/dt>/);
		assert.match(html, /<dt>Location<\/dt>/);
		assert.match(html, /AssertionError/);
		assert.match(html, /data-action="openLearnerSource"/);
		assert.match(html, /data-source-path="search_engine.py"/);
		assert.match(html, /data-source-line="4"/);
		assert.match(html, /Open your code/);
		assert.match(html, /<summary>Details<\/summary>/);
		assert.doesNotMatch(html, /Open test case/);
		assert.doesNotMatch(html, /1 failed/);
	});

	test('labels an exception raised during a test as a code error for that test', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.selectedSection = ChallengeSection.Results;
		snapshot.testStatus = 'failed';
		snapshot.latestTestEvidence = {
			outcome: 'test_failures',
			passedCount: 0,
			failedCount: 1,
			totalCount: 1,
			failures: [{
				name: 'test_prefix',
				testPath: '.codearc/tests/current/prefix-search/test_prefix.py',
				levelId: 'prefix-search',
				category: 'current',
				status: 'failed',
				failureKind: 'learner_error',
				message: 'ZeroDivisionError: division by zero',
				traceback: 'search_engine.py:12: in search_prefix\n    return 1 / 0\nE   ZeroDivisionError: division by zero',
				sourcePath: 'search_engine.py',
				sourceLine: 12,
				stdout: 'dividing <2> by 0\n',
			}],
			testCases: [{
				name: 'test_prefix',
				testPath: '.codearc/tests/current/prefix-search/test_prefix.py',
				levelId: 'prefix-search',
				category: 'current',
				status: 'failed',
				failureKind: 'learner_error',
				message: 'ZeroDivisionError: division by zero',
				traceback: 'search_engine.py:12: in search_prefix\n    return 1 / 0\nE   ZeroDivisionError: division by zero',
				sourcePath: 'search_engine.py',
				sourceLine: 12,
				stdout: 'dividing <2> by 0\n',
			}],
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
		assert.match(html, /Your code raised an unexpected error while this test ran/);
		assert.match(html, /ZeroDivisionError: division by zero/);
		assert.match(html, /<span>Output<\/span><code>dividing &lt;2&gt; by 0\n<\/code>/);
		assert.match(html, /data-action="openLearnerSource"/);
		assert.match(html, /data-source-path="search_engine.py"/);
		assert.match(html, /data-source-line="12"/);
		assert.match(html, /Open your code/);
		assert.match(html, /Open test case/);
		assert.match(html, /<summary>Details<\/summary>/);
		assert.match(html, /search_engine\.py:12: in search_prefix/);
	});

	test('identifies the test that was running when pytest timed out', async () => {
		const snapshot = createAttemptSessionSnapshot();
		snapshot.selectedSection = ChallengeSection.Results;
		snapshot.testStatus = 'failed';
		const timedOutTest = {
			name: 'test_divides_2',
			testFunctionName: 'test_divides_2',
			testPath: '.codearc/tests/current/phrase-search/test_phrase.py',
			levelId: 'phrase-search',
			category: 'current' as const,
			status: 'failed' as const,
			failureKind: 'timed_out' as const,
			message: 'This test did not finish before CodeArc’s time limit.',
		};
		snapshot.latestTestEvidence = {
			outcome: 'timed_out',
			passedCount: 7,
			failedCount: 1,
			totalCount: 8,
			failures: [timedOutTest],
			testCases: [timedOutTest],
			exitCode: null,
			timedOut: true,
			runnerVersion: 'pytest 9.1.1',
			codeHash: '1234567890abcdef',
			durationMilliseconds: 30_000,
		};

		const html = await renderChallenge(
			markdownRenderer,
			createCatalogSnapshot(),
			undefined,
			snapshot,
		);

		assert.match(html, /Divides 2/);
		assert.match(
			html,
			/This test was still running when CodeArc’s time limit expired\./,
		);
		assert.match(html, /This test did not finish before CodeArc’s time limit\./);
		assert.match(html, /data-test-name="test_divides_2"/);
		assert.doesNotMatch(html, /pytest did not finish before the time limit/);
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
		outcome: 'passed' as const,
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
