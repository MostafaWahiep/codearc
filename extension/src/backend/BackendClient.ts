import type {
	AttemptDto,
	AttemptSummaryDto,
	ChallengeSummaryDto,
	VisibleLevelDto,
	PublicTestBundleDto,
	TestSubmission,
	TestSubmissionResultDto,
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

	getVisibleTests(attemptId: string): Promise<PublicTestBundleDto>;

	submitTestResults(
		attemptId: string,
		testSubmission: TestSubmission,
	): Promise<TestSubmissionResultDto>;
}
