import {
	ChallengeController,
	type ChallengeSnapshot,
} from './ChallengeController';
import type {
	TestRunProgress,
	TestRunResult,
	TestRunner,
} from './TestRunner';

/** Learner-facing section names and the values exchanged with the webview. */
export enum ChallengeSection {
	Build = 'Build',
	Results = 'Results',
	Design = 'Design',
}

export enum SessionStatus {
	Idle = 'idle',
	Running = 'running',
	Failed = 'failed',
	Passed = 'passed',
	Refactoring = 'refactoring',
}

type RestorableSessionStatus = Exclude<SessionStatus, SessionStatus.Running>;

export interface PrototypeSessionSnapshot {
	challenge?: ChallengeSnapshot;
	activeSection: ChallengeSection;
	status: SessionStatus;
	testProgress?: TestRunProgress;
	latestTestResult?: TestRunResult;
	isEvolutionUnlocked: boolean;
	canRevealNext: boolean;
}

export class PrototypeSession {
	private challenge: ChallengeSnapshot | undefined;
	private activeSection = ChallengeSection.Build;
	private status = SessionStatus.Idle;
	private statusBeforeRun: RestorableSessionStatus = SessionStatus.Idle;
	private testProgress: TestRunProgress | undefined;
	private latestTestResult: TestRunResult | undefined;
	private readonly completedLevelResults = new Map<string, TestRunResult>();
	private generation = 0;

	public constructor(
		private readonly controller: ChallengeController,
		private readonly testRunner: TestRunner,
	) {}

	public async start(): Promise<PrototypeSessionSnapshot> {
		const generation = ++this.generation;
		try {
			const challenge = await this.controller.start();
			if (generation !== this.generation) {
				return this.getSnapshot();
			}

			this.testRunner.reset();
			this.challenge = challenge;
			this.activeSection = ChallengeSection.Build;
			this.status = SessionStatus.Idle;
			this.statusBeforeRun = SessionStatus.Idle;
			this.testProgress = undefined;
			this.latestTestResult = undefined;
			this.completedLevelResults.clear();
		} catch (error) {
			if (generation === this.generation && this.status === SessionStatus.Running) {
				this.status = this.statusBeforeRun;
			}
			throw error;
		}

		return this.getSnapshot();
	}

	public async runChecks(
		reportSnapshot?: (snapshot: PrototypeSessionSnapshot) => void,
	): Promise<PrototypeSessionSnapshot> {
		const challenge = this.requireChallenge();
		if (!challenge.isViewingLatestLevel) {
			throw new Error('Return to the latest level before running checks.');
		}
		if (this.status === SessionStatus.Running) {
			throw new Error('Checks are already running.');
		}

		const generation = this.generation;
		this.statusBeforeRun = this.status;
		this.status = SessionStatus.Running;
		this.activeSection = ChallengeSection.Results;
		this.testProgress = undefined;
		this.latestTestResult = undefined;

		let result: TestRunResult;
		try {
			result = await this.testRunner.run(
				{
					levelId: challenge.currentLevel.id,
					levelNumber: challenge.currentLevelNumber,
				},
				(progress) => {
					if (generation !== this.generation) {
						return;
					}

					this.testProgress = progress;
					reportSnapshot?.(this.getSnapshot());
				},
			);
		} catch (error) {
			if (generation === this.generation) {
				this.status = this.statusBeforeRun;
				this.testProgress = undefined;
			}
			throw error;
		}

		if (generation !== this.generation) {
			return this.getSnapshot();
		}

		this.latestTestResult = result;

		if (result.passed) {
			this.completedLevelResults.set(challenge.currentLevel.id, result);
			this.challenge = this.controller.completeCurrentLevel();
			this.status = SessionStatus.Passed;
		} else {
			this.status = SessionStatus.Failed;
		}

		return this.getSnapshot();
	}

	public selectSection(section: ChallengeSection): PrototypeSessionSnapshot {
		if (section === ChallengeSection.Design && !this.challenge?.isCurrentLevelComplete) {
			throw new Error('Design reflection unlocks after the current stage passes.');
		}

		this.activeSection = section;
		return this.getSnapshot();
	}

	public selectLevel(levelNumber: number): PrototypeSessionSnapshot {
		if (this.status === SessionStatus.Running) {
			throw new Error('Wait for the current check run to finish before changing levels.');
		}

		this.challenge = this.controller.selectLevel(levelNumber);
		this.activeSection = ChallengeSection.Build;
		return this.getSnapshot();
	}

	public beginRefactor(): PrototypeSessionSnapshot {
		const challenge = this.requireChallenge();
		if (!challenge.isViewingLatestLevel) {
			throw new Error('Return to the latest level before refactoring.');
		}
		if (!challenge.isCurrentLevelComplete) {
			throw new Error('Complete the current stage before starting a refactor checkpoint.');
		}

		this.status = SessionStatus.Refactoring;
		this.activeSection = ChallengeSection.Build;

		return this.getSnapshot();
	}

	public advanceToNextLevel(): PrototypeSessionSnapshot {
		if (this.status !== SessionStatus.Passed) {
			throw new Error('Run checks after refactoring before revealing the next requirement.');
		}

		this.challenge = this.controller.advanceToNextLevel();
		this.activeSection = ChallengeSection.Build;
		this.status = SessionStatus.Idle;
		this.testProgress = undefined;
		this.latestTestResult = undefined;

		return this.getSnapshot();
	}

	public getSnapshot(): PrototypeSessionSnapshot {
		const isViewingHistory = this.challenge !== undefined
			&& !this.challenge.isViewingLatestLevel;
		const displayedResult = isViewingHistory
			? this.completedLevelResults.get(this.challenge?.currentLevel.id ?? '')
			: this.latestTestResult;

		return {
			challenge: this.challenge,
			activeSection: this.activeSection,
			status: isViewingHistory ? SessionStatus.Passed : this.status,
			testProgress: isViewingHistory ? undefined : this.testProgress,
			latestTestResult: displayedResult,
			isEvolutionUnlocked: this.challenge?.isCurrentLevelComplete ?? false,
			canRevealNext: Boolean(this.challenge?.canAdvance)
				&& Boolean(this.challenge?.isViewingLatestLevel)
				&& this.status === SessionStatus.Passed,
		};
	}

	private requireChallenge(): ChallengeSnapshot {
		if (!this.challenge) {
			throw new Error('Start a challenge before using the learning loop.');
		}

		return this.challenge;
	}
}
