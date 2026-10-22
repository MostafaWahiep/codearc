import type { BackendClient } from '../backend/BackendClient';
import type {
	AttemptDto,
	ChallengeSummaryDto,
	TestSubmission,
	VisibleLevelDto,
} from '../backend/BackendTypes';
import type { OpenedAttempt } from './AttemptCatalog';
import type { TestEvidence } from './LocalTestRunner';
import { ChallengeSection } from './ChallengeSection';

export type AttemptTestStatus = 'idle' | 'running' | 'passed' | 'failed';
export type AttemptSubmissionStatus =
	| 'idle'
	| 'submitting'
	| 'accepted'
	| 'rejected';

export interface AttemptSessionSnapshot {
	challenge: ChallengeSummaryDto;
	attempt: AttemptDto;
	level: VisibleLevelDto;
	selectedSection: ChallengeSection;
	testStatus: AttemptTestStatus;
	submissionStatus: AttemptSubmissionStatus;
	submissionError?: string;
	latestTestEvidence?: TestEvidence;
}

export class AttemptSession {
	private snapshot: AttemptSessionSnapshot | undefined;
	private revision = 0;

	public constructor(private readonly backendClient: BackendClient) {}

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
		this.snapshot = {
			challenge,
			attempt: openedAttempt.attempt,
			level: openedAttempt.level,
			selectedSection: ChallengeSection.Build,
			testStatus: 'idle',
			submissionStatus: 'idle',
			submissionError: undefined,
		};
		return this.getRequiredSnapshot();
	}

	public async selectLevel(levelId: string): Promise<AttemptSessionSnapshot> {
		const current = this.getRequiredSnapshot();
		this.requireVisibleProgress(current.attempt, levelId);
		const revision = ++this.revision;
		const level = await this.backendClient.getVisibleLevel(
			current.attempt.id,
			levelId,
		);

		if (revision === this.revision) {
			this.snapshot = {
				...current,
				level,
				selectedSection: ChallengeSection.Build,
				testStatus: 'idle',
				latestTestEvidence: undefined,
				submissionStatus: 'idle',
				submissionError: undefined,
			};
		}

		return this.getRequiredSnapshot();
	}

	public startTestRun(): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		if (current.testStatus === 'running') {
			throw new Error('A CodeArc test run is already in progress.');
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
			testStatus: evidence.passed ? 'passed' : 'failed',
			latestTestEvidence: evidence,
		};
		return this.getRequiredSnapshot();
	}

	public cancelTestRun(): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		this.snapshot = {
			...current,
			testStatus: current.latestTestEvidence
				? current.latestTestEvidence.passed ? 'passed' : 'failed'
				: 'idle',
		};
		return this.getRequiredSnapshot();
	}

	public selectSection(section: ChallengeSection): AttemptSessionSnapshot {
		const current = this.getRequiredSnapshot();
		this.snapshot = {
			...current,
			selectedSection: section,
		};
		return this.getRequiredSnapshot();
	}

	public clear(): void {
		this.revision += 1;
		this.snapshot = undefined;
	}

	public async submitTestResults(): Promise<AttemptSessionSnapshot> {
		const submission = this.createTestSubmission();
		const current = this.startSubmission();
		const revision = ++this.revision;

		try {
			const result = await this.backendClient.submitTestResults(
				current.attempt.id,
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
			return this.getRequiredSnapshot();
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
	}

	public createTestSubmission(): TestSubmission {
		const current = this.getRequiredSnapshot();
		const evidence = current.latestTestEvidence;

		if (!evidence) {
			throw new Error('No test evidence available to create a submission.');
		}

		if (evidence.exitCode === null) {
			throw new Error('Test evidence must include an exit code.');
		}

		return {
			levelId: current.attempt.activeLevelId,
			exitCode: evidence.exitCode,
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
				latestTestEvidence: this.snapshot.latestTestEvidence
					? {
						...this.snapshot.latestTestEvidence,
						failures: this.snapshot.latestTestEvidence.failures.map((failure) => ({ ...failure })),
						testCases: this.snapshot.latestTestEvidence.testCases.map((testCase) => ({ ...testCase })),
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
}
