import type {
	AttemptDto,
	AttemptSummaryDto,
	ChallengeSummaryDto,
	VisibleLevelDto,
	LevelChangeImpactDto,
	PublicTestBundleDto,
	TestSubmission,
	TestSubmissionResultDto,
	StarterFilesDto,
	SubmissionDto,
	SubmissionSourceFile,
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

	getLevelChangeImpact(
		attemptId: string,
		levelId: string,
	): Promise<LevelChangeImpactDto>;

	getVisibleTests(attemptId: string): Promise<PublicTestBundleDto>;

	submitTestResults(
		attemptId: string,
		submissionId: string,
		testSubmission: TestSubmission,
	): Promise<TestSubmissionResultDto>;

	createSubmission(
		attemptId: string,
		files: SubmissionSourceFile[],
	): Promise<SubmissionDto>;

	getStarterFiles(
		challengeId: string,
		version: string,
	): Promise<StarterFilesDto>;
}
