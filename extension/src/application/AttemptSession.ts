import type { BackendClient } from '../backend/BackendClient';
import type {
	AttemptDto,
	ChallengeSummaryDto,
	LevelChangeImpactDto,
	TestSubmission,
	TestSubmissionResultDto,
	VisibleLevelDto,
} from '../backend/BackendTypes';
import type { OpenedAttempt } from './AttemptCatalog';
import type { TestEvidence } from './LocalTestRunner';
import { ChallengeSection } from './ChallengeSection';
import type { SubmissionSourceProvider } from './SubmissionSourceProvider';

const TIMEOUT_EXIT_CODE = 124;

export type AttemptTestStatus = 'idle' | 'running' | 'passed' | 'failed';
export type AttemptSubmissionStatus =
	| 'idle'
	| 'submitting'
	| 'accepted'
	| 'rejected';
export type ChangeImpactState =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'ready'; value: LevelChangeImpactDto }
	| { status: 'failed'; error: string };

export interface AttemptSessionSnapshot {
	challenge: ChallengeSummaryDto;
	attempt: AttemptDto;
	level: VisibleLevelDto;
	selectedSection: ChallengeSection;
	testStatus: AttemptTestStatus;
	submissionStatus: AttemptSubmissionStatus;
	submissionError?: string;
	changeImpact: ChangeImpactState;
	latestTestEvidence?: TestEvidence;
}

export class AttemptSession {
	private snapshot: AttemptSessionSnapshot | undefined;
	private revision = 0;
	private readonly changeImpactCache = new Map<string, LevelChangeImpactDto>();

	public constructor(
		private readonly backendClient: BackendClient,
		private readonly submissionSourceProvider: SubmissionSourceProvider,
	) {}

	public open(
		challenge: ChallengeSummaryDto,
		openedAttempt: OpenedAttempt,
	): AttemptSessionSnapshot {
		if (openedAttempt.attempt.challengeId !== challenge.id) {
			throw new Error('The opened attempt does not belong to this challenge.');
		}
		if (openedAttempt.level.id !== openedAttempt.attempt.activeLevelId) {
			throw new Error('The backend returned the wrong current level.');
		}
		this.requireVisibleProgress(
			openedAttempt.attempt,
			openedAttempt.level.id,
		);

		this.revision += 1;
		this.changeImpactCache.clear();
		this.snapshot = {
			challenge,
			attempt: openedAttempt.attempt,
			level: openedAttempt.level,
			selectedSection: ChallengeSection.Build,
			testStatus: 'idle',
			submissionStatus: 'idle',
			submissionError: undefined,
			changeImpact: { status: 'idle' },
		};
		return this.getRequiredSnapshot();
	}

	public async selectLevel(levelId: string): Promise<AttemptSessionSnapshot> {
		const current = this.getRequiredSnapshot();
		if (current.submissionStatus === 'submitting') {
			throw new Error('Wait for the current submission to finish.');
		}
		this.requireVisibleProgress(current.attempt, levelId);
		const revision = ++this.revision;
		const level = await this.backendClient.getVisibleLevel(
			current.attempt.id,
			levelId,
		);

		if (revision === this.revision) {
			const cachedImpact = this.changeImpactCache.get(level.id);
			this.snapshot = {
				...current,
				level,
				selectedSection: ChallengeSection.Build,
				testStatus: 'idle',
				latestTestEvidence: undefined,
				submissionStatus: 'idle',
				submissionError: undefined,
				changeImpact: cachedImpact
					? { status: 'ready', value: cloneChangeImpact(cachedImpact) }
					: { status: 'idle' },
			};
		}

		return this.getRequiredSnapshot();
	}

	public startTestRun(): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		if (current.testStatus === 'running') {
			throw new Error('A CodeArc test run is already in progress.');
		}
		if (current.submissionStatus === 'submitting') {
			throw new Error('A CodeArc submission is already in progress.');
		}
		this.snapshot = {
			...current,
			selectedSection: ChallengeSection.Results,
			testStatus: 'running',
			submissionStatus: 'idle',
			submissionError: undefined,
		};
		return this.getRequiredSnapshot();
	}

	public completeTestRun(evidence: TestEvidence): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		this.snapshot = {
			...current,
			selectedSection: ChallengeSection.Results,
			testStatus: evidence.outcome === 'passed' ? 'passed' : 'failed',
			latestTestEvidence: evidence,
		};
		return this.getRequiredSnapshot();
	}

	public cancelTestRun(): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		this.snapshot = {
			...current,
			testStatus: current.latestTestEvidence
				? current.latestTestEvidence.outcome === 'passed' ? 'passed' : 'failed'
				: 'idle',
		};
		return this.getRequiredSnapshot();
	}

	public selectSection(section: ChallengeSection): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		if (section === ChallengeSection.Changes) {
			this.requireChangeImpactAvailable(current);
		}
		this.snapshot = {
			...current,
			selectedSection: section,
		};
		return this.getRequiredSnapshot();
	}

	public async loadChangeImpact(
		force = false,
	): Promise<AttemptSessionSnapshot> {
		const current = this.getRequiredSnapshot();
		this.requireChangeImpactAvailable(current);

		if (current.changeImpact.status === 'loading') {
			return current;
		}

		const levelId = current.level.id;
		const cachedImpact = this.changeImpactCache.get(levelId);
		if (cachedImpact && !force) {
			this.snapshot = {
				...current,
				changeImpact: {
					status: 'ready',
					value: cloneChangeImpact(cachedImpact),
				},
			};
			return this.getRequiredSnapshot();
		}

		const revision = this.revision;
		this.snapshot = {
			...current,
			changeImpact: { status: 'loading' },
		};

		try {
			const impact = await this.backendClient.getLevelChangeImpact(
				current.attempt.id,
				levelId,
			);
			if (revision === this.revision) {
				const storedImpact = cloneChangeImpact(impact);
				this.changeImpactCache.set(levelId, storedImpact);
				const latest = this.getRequiredSnapshot();
				if (latest.level.id === levelId) {
					this.snapshot = {
						...latest,
						changeImpact: {
							status: 'ready',
							value: cloneChangeImpact(storedImpact),
						},
					};
				}
			}
		} catch (error) {
			if (revision === this.revision) {
				const latest = this.getRequiredSnapshot();
				if (latest.level.id === levelId) {
					this.snapshot = {
						...latest,
						changeImpact: {
							status: 'failed',
							error: error instanceof Error
								? error.message
								: String(error),
						},
					};
				}
			}
		}

		return this.getRequiredSnapshot();
	}

	public clear(): void {
		this.revision += 1;
		this.changeImpactCache.clear();
		this.snapshot = undefined;
	}

	public async submitSolution(): Promise<AttemptSessionSnapshot> {
		const submission = this.createTestSubmission();
		const current = this.startSubmission();
		const revision = ++this.revision;
		let result: TestSubmissionResultDto;

		try {
			const sourceFiles = await this.submissionSourceProvider.collect(
				current.attempt,
			);
			if (revision !== this.revision) {
				return this.getRequiredSnapshot();
			}
			const createSubmissionResponse = await this.backendClient.createSubmission(
				current.attempt.id,
				sourceFiles,
			);
			if (revision !== this.revision) {
				return this.getRequiredSnapshot();
			}
			result = await this.backendClient.submitTestResults(
				current.attempt.id,
				createSubmissionResponse.id,
				submission,
			);

			if (revision === this.revision) {
				this.snapshot = {
					...current,
					attempt: result.attempt,
					submissionStatus: 'accepted',
					submissionError: undefined,
				};
			}
		} catch (error) {
			if (revision === this.revision) {
				const message = error instanceof Error ? error.message : String(error);
				this.snapshot = {
					...current,
					submissionStatus: 'rejected',
					submissionError: message,
				};
			}
			throw error;
		}

		if (revision !== this.revision || result.outcome === 'tests_failed') {
			return this.getRequiredSnapshot();
		}

		const visibleLevel = await this.backendClient.getVisibleLevel(
			result.attempt.id,
			result.completedLevelId ?? current.level.id,
		);
		if (revision === this.revision) {
			const accepted = this.getRequiredSnapshot();
			this.snapshot = {
				...accepted,
				level: visibleLevel,
				selectedSection: ChallengeSection.Design,
				testStatus: 'idle',
				latestTestEvidence: undefined,
			};
		}
		return this.getRequiredSnapshot();
	}

	public async moveToCurrentStage(): Promise<AttemptSessionSnapshot> {
		const current = this.getRequiredSnapshot();
		if (current.submissionStatus === 'submitting') {
			throw new Error('Wait for the current submission to finish.');
		}

		if (current.level.id === current.attempt.activeLevelId) {
			return current;
		}

		return this.selectLevel(current.attempt.activeLevelId);
	}

	public createTestSubmission(): TestSubmission {
		const current = this.getRequiredSnapshot();
		const evidence = current.latestTestEvidence;

		if (!evidence) {
			throw new Error('No test evidence available to create a submission.');
		}

		if (evidence.exitCode === null && !evidence.timedOut) {
			throw new Error('Test evidence must include an exit code.');
		}

		return {
			levelId: current.attempt.activeLevelId,
			exitCode: evidence.exitCode ?? TIMEOUT_EXIT_CODE,
			timedOut: evidence.timedOut,
			passedCount: evidence.passedCount,
			failedCount: evidence.failedCount,
		};
	}

	public getSnapshot(): AttemptSessionSnapshot | undefined {
		return this.snapshot
			? {
				...this.snapshot,
				challenge: { ...this.snapshot.challenge },
				attempt: {
					...this.snapshot.attempt,
					levels: [...this.snapshot.attempt.levels],
				},
				level: {
					...this.snapshot.level,
					sections: [...this.snapshot.level.sections],
				},
				changeImpact: cloneChangeImpactState(this.snapshot.changeImpact),
				latestTestEvidence: this.snapshot.latestTestEvidence
					? {
						...this.snapshot.latestTestEvidence,
						failures: this.snapshot.latestTestEvidence.failures.map(cloneTestCase),
						testCases: this.snapshot.latestTestEvidence.testCases.map(cloneTestCase),
					}
					: undefined,
			}
			: undefined;
	}

	private startSubmission(): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		if (current.submissionStatus === 'submitting') {
			throw new Error('A CodeArc submission is already in progress.');
		}
		this.snapshot = {
			...current,
			submissionStatus: 'submitting',
			submissionError: undefined,
		};
		return this.getRequiredSnapshot();
	}

	private getRequiredSnapshot(): AttemptSessionSnapshot {
		const snapshot = this.getSnapshot();
		if (!snapshot) {
			throw new Error('Open an attempt before selecting its content.');
		}
		return snapshot;
	}

	private requireVisibleProgress(attempt: AttemptDto, levelId: string): void {
		const isVisible = attempt.levels.some((level) => level.levelId === levelId);
		if (!isVisible) {
			throw new Error('Choose a level already visible in this attempt.');
		}
	}

	private requireChangeImpactAvailable(
		snapshot: AttemptSessionSnapshot,
	): void {
		const stageIndex = snapshot.attempt.levels.findIndex(
			(level) => level.levelId === snapshot.level.id,
		);
		if (stageIndex <= 0) {
			throw new Error('Code changes are available starting from stage 2.');
		}

		const progress = snapshot.attempt.levels[stageIndex];
		if (progress.status !== 'completed' || snapshot.level.status !== 'completed') {
			throw new Error('Complete this stage before reviewing its code changes.');
		}
	}
}

function cloneTestCase<T extends TestEvidence['testCases'][number]>(testCase: T): T {
	return {
		...testCase,
		comparison: testCase.comparison ? { ...testCase.comparison } : undefined,
	};
}

function cloneChangeImpact(impact: LevelChangeImpactDto): LevelChangeImpactDto {
	return {
		...impact,
		summary: { ...impact.summary },
		files: impact.files.map((file) => ({
			...file,
			addedMethods: [...file.addedMethods],
			removedMethods: [...file.removedMethods],
			modifiedMethods: file.modifiedMethods.map((method) => ({ ...method })),
		})),
	};
}

function cloneChangeImpactState(state: ChangeImpactState): ChangeImpactState {
	return state.status === 'ready'
		? { status: 'ready', value: cloneChangeImpact(state.value) }
		: { ...state };
}
