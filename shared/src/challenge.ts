export interface ChallengeManifest {
	id: string;
	title: string;
	description: string;
	starterPath: string;
	levels: ChallengeLevelManifest[];
}

export interface ChallengeLevelManifest {
	id: string;
	title: string;
	requirementPath: string;
	designFeedbackPath: string;
	testsPath: string;
}
