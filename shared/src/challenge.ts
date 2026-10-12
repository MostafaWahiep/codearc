export interface ChallengeManifest {
	id: string;
	version: string;
	title: string;
	description: string;
	starterPath: string;
	entrypointPath: string;
	levels: ChallengeLevelManifest[];
}

export enum LevelSectionDisplay {
	Static = 'static',
	Expanded = 'expanded',
	Collapsed = 'collapsed',
}

export interface LevelSectionManifest {
	id: string;
	title: string;
	contentPath: string;
	display: LevelSectionDisplay;
}

export interface ChallengeLevelManifest {
	id: string;
	title: string;
	sections: LevelSectionManifest[];
	designFeedbackPath: string;
	testsPath: string;
}
