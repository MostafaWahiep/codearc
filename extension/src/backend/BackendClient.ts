import type {
	AttemptDto,
	AttemptSummaryDto,
	ChallengeSummaryDto,
	VisibleLevelDto,
} from './BackendTypes';

export interface BackendClient {
	listChallenges(): Promise<ChallengeSummaryDto[]>;

	listAttempts(
		userId: string,
		challengeId: string,
	): Promise<AttemptSummaryDto[]>;

	startAttempt(
		userId: string,
		challengeId: string,
	): Promise<AttemptDto>;

	getAttempt(attemptId: string): Promise<AttemptDto>;

	getVisibleLevel(
		attemptId: string,
		levelId: string,
	): Promise<VisibleLevelDto>;
}
