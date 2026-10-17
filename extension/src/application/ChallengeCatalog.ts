import type { BackendClient } from '../backend/BackendClient';
import type { ChallengeSummaryDto } from '../backend/BackendTypes';

export enum ChallengeCatalogStatus {
	Idle = 'idle',
	Loading = 'loading',
	Ready = 'ready',
	Failed = 'failed',
}

export interface ChallengeCatalogSnapshot {
	status: ChallengeCatalogStatus;
	challenges: ChallengeSummaryDto[];
	errorMessage?: string;
}

export class ChallengeCatalog {
	private snapshot: ChallengeCatalogSnapshot = {
		status: ChallengeCatalogStatus.Idle,
		challenges: [],
	};

	public constructor(private readonly backendClient: BackendClient) {}

	public async load(): Promise<ChallengeCatalogSnapshot> {
		this.snapshot = {
			status: ChallengeCatalogStatus.Loading,
			challenges: [],
		};

		try {
			const challenges = await this.backendClient.listChallenges();
			this.snapshot = {
				status: ChallengeCatalogStatus.Ready,
				challenges,
			};
		} catch (error) {
			this.snapshot = {
				status: ChallengeCatalogStatus.Failed,
				challenges: [],
				errorMessage: error instanceof Error ? error.message : String(error),
			};
		}

		return this.getSnapshot();
	}

	public getSnapshot(): ChallengeCatalogSnapshot {
		return {
			...this.snapshot,
			challenges: [...this.snapshot.challenges],
		};
	}
}
