import type { BackendClient } from '../backend/BackendClient';
import type {
	AttemptDto,
	AttemptSummaryDto,
} from '../backend/BackendTypes';

export enum AttemptCatalogStatus {
	Idle = 'idle',
	Loading = 'loading',
	Ready = 'ready',
	Failed = 'failed',
}

export interface AttemptCatalogSnapshot {
	status: AttemptCatalogStatus;
	challengeId?: string;
	attempts: AttemptSummaryDto[];
	errorMessage?: string;
}

export class AttemptCatalog {
	private snapshot: AttemptCatalogSnapshot = {
		status: AttemptCatalogStatus.Idle,
		attempts: [],
	};

	public constructor(
		private readonly backendClient: BackendClient,
		private readonly userId: string,
	) {}

	public async load(challengeId: string): Promise<AttemptCatalogSnapshot> {
		this.snapshot = {
			status: AttemptCatalogStatus.Loading,
			challengeId,
			attempts: [],
		};

		try {
			const attempts = await this.backendClient.listAttempts(
				this.userId,
				challengeId,
			);
			this.snapshot = {
				status: AttemptCatalogStatus.Ready,
				challengeId,
				attempts,
			};
		} catch (error) {
			this.snapshot = {
				status: AttemptCatalogStatus.Failed,
				challengeId,
				attempts: [],
				errorMessage: error instanceof Error ? error.message : String(error),
			};
		}

		return this.getSnapshot();
	}

	public startNew(challengeId: string): Promise<AttemptDto> {
		return this.backendClient.startAttempt(this.userId, challengeId);
	}

	public async continue(attemptId: string): Promise<AttemptDto> {
		const isVisibleAttempt = this.snapshot.attempts.some(
			(attempt) => attempt.id === attemptId,
		);
		if (!isVisibleAttempt) {
			throw new Error('Choose one of the listed attempts to continue.');
		}

		return this.backendClient.getAttempt(attemptId);
	}

	public clear(): AttemptCatalogSnapshot {
		this.snapshot = {
			status: AttemptCatalogStatus.Idle,
			attempts: [],
		};
		return this.getSnapshot();
	}

	public getSnapshot(): AttemptCatalogSnapshot {
		return {
			...this.snapshot,
			attempts: [...this.snapshot.attempts],
		};
	}
}
