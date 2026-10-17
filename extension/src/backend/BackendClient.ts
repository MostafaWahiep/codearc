import type {
	AttemptDto,
	ChallengeSummaryDto,
} from './BackendTypes';

export interface BackendClient {
	listChallenges(): Promise<ChallengeSummaryDto[]>;

	startAttempt(
		userId: string,
		challengeId: string,
	): Promise<AttemptDto>;

	getAttempt(attemptId: string): Promise<AttemptDto>;
}
