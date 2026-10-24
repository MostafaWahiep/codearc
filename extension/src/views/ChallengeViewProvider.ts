import * as vscode from 'vscode';
import {
	AttemptCatalog,
	type AttemptCatalogSnapshot,
	type OpenedAttempt,
} from '../application/AttemptCatalog';
import {
	AttemptSession,
	type AttemptSessionSnapshot,
} from '../application/AttemptSession';
import {
	ChallengeCatalog,
	ChallengeCatalogStatus,
	type ChallengeCatalogSnapshot,
} from '../application/ChallengeCatalog';
import { ChallengeSection } from '../application/ChallengeSection';
import type { LocalTestRunner } from '../application/LocalTestRunner';
import { LearnerWorkspaceService } from '../infrastructure/LearnerWorkspaceService';
import { ChallengeViewAction } from './ChallengeViewAction';
import type { MarkdownRenderer } from './MarkdownRenderer';
import { createChallengeViewHtml } from './challengeViewHtml';

export class ChallengeViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'codearc.challengeView';

	private view: vscode.WebviewView | undefined;
	private catalogSnapshot: ChallengeCatalogSnapshot;
	private attemptCatalogSnapshot: AttemptCatalogSnapshot;
	private attemptSessionSnapshot: AttemptSessionSnapshot | undefined;
	private catalogLoad: Promise<void> | undefined;
	private renderRevision = 0;
	private markdownHighlightStylesheetUri: string | undefined;

	public constructor(
		private readonly challengeCatalog: ChallengeCatalog,
		private readonly attemptCatalog: AttemptCatalog,
		private readonly attemptSession: AttemptSession,
		private readonly learnerWorkspace: LearnerWorkspaceService,
		private readonly localTestRunner: LocalTestRunner,
		private readonly markdownRenderer: MarkdownRenderer,
	) {
		this.catalogSnapshot = challengeCatalog.getSnapshot();
		this.attemptCatalogSnapshot = attemptCatalog.getSnapshot();
		this.attemptSessionSnapshot = attemptSession.getSnapshot();
	}

	public resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		const markdownExtension = vscode.extensions.getExtension(
			'vscode.markdown-language-features',
		);
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: markdownExtension
				? [markdownExtension.extensionUri]
				: [],
		};
		this.markdownHighlightStylesheetUri = markdownExtension
			? view.webview.asWebviewUri(
				vscode.Uri.joinPath(markdownExtension.extensionUri, 'media', 'highlight.css'),
			).toString()
			: undefined;
		view.webview.onDidReceiveMessage((message: unknown) => {
			void this.handleMessage(message);
		});
		view.onDidDispose(() => {
			this.view = undefined;
			this.renderRevision += 1;
		});

		this.render();
		void this.loadChallengeCatalog();
	}

	public async startChallenge(challengeId?: string): Promise<void> {
		await this.loadChallengeCatalog();
		const availableChallenge = challengeId
			? this.catalogSnapshot.challenges.find((challenge) => challenge.id === challengeId)
			: this.catalogSnapshot.challenges[0];
		if (!availableChallenge) {
			throw new Error('Choose an available challenge before starting.');
		}

		await this.loadAttempts(availableChallenge.id);
	}

	public async showChallenge(): Promise<void> {
		if (!this.attemptSessionSnapshot) {
			await this.startChallenge();
		}
	}

	public async restoreOpenedWorkspace(): Promise<void> {
		const workspace = await this.learnerWorkspace.findOpenedAttemptWorkspace();
		if (!workspace) {
			return;
		}

		await this.loadChallengeCatalog();
		if (this.catalogSnapshot.status !== ChallengeCatalogStatus.Ready) {
			throw new Error(
				this.catalogSnapshot.errorMessage
					?? 'The challenge catalog could not be loaded.',
			);
		}

		const openedAttempt = await this.attemptCatalog.restore(workspace.attemptId);
		if (openedAttempt.attempt.challengeId !== workspace.challengeId) {
			throw new Error('The opened learner folder does not match its backend attempt.');
		}

		await this.learnerWorkspace.ensureWorkspace(openedAttempt.attempt);
		this.openAttemptSession(openedAttempt);
		this.render();
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!isViewMessage(message)) {
			return;
		}

		try {
			switch (message.type) {
				case ChallengeViewAction.SelectChallenge:
					await this.startChallenge(message.challengeId);
					return;
				case ChallengeViewAction.StartNewAttempt:
					await this.startNewAttempt(message.challengeId);
					return;
				case ChallengeViewAction.ContinueAttempt:
					await this.continueAttempt(message.attemptId);
					return;
				case ChallengeViewAction.BackToCatalog:
					this.attemptCatalogSnapshot = this.attemptCatalog.clear();
					this.attemptSession.clear();
					this.attemptSessionSnapshot = undefined;
					this.render();
					return;
				case ChallengeViewAction.RetryAttempts:
					await this.retryAttempts();
					return;
				case ChallengeViewAction.RetryCatalog:
					await this.loadChallengeCatalog(true);
					return;
				case ChallengeViewAction.RunChecks:
					await this.runChecks();
					return;
				case ChallengeViewAction.SelectSection:
					this.attemptSessionSnapshot = this.attemptSession.selectSection(
						message.section,
					);
					break;
				case ChallengeViewAction.SelectAttemptLevel:
					this.attemptSessionSnapshot = await this.attemptSession.selectLevel(
						message.levelId,
					);
					break;
				case ChallengeViewAction.OpenWorkspace:
					await this.openWorkspace();
					this.render();
					return;
				case ChallengeViewAction.OpenTestCase:
					await this.openTestCase(message.testPath, message.testName);
					return;
				case ChallengeViewAction.SubmitSolution:
					await this.submitSolution();
					return;
				case ChallengeViewAction.CurrentStage:
					await this.moveToCurrentStage();
					return;
			}

			this.render();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await vscode.window.showErrorMessage(`CodeArc: ${message}`);
			this.render();
		}
	}

	private async startNewAttempt(challengeId: string): Promise<void> {
		const openedAttempt = await this.attemptCatalog.startNew(challengeId);
		this.openAttemptSession(openedAttempt);
		this.render();
	}

	private async continueAttempt(attemptId: string): Promise<void> {
		const openedAttempt = await this.attemptCatalog.continue(attemptId);
		this.openAttemptSession(openedAttempt);
		this.render();
	}

	private openAttemptSession(openedAttempt: OpenedAttempt): void {
		const challenge = this.catalogSnapshot.challenges.find(
			(item) => item.id === openedAttempt.attempt.challengeId,
		);
		if (!challenge) {
			throw new Error('The attempt challenge is not in the current catalog.');
		}
		this.attemptSessionSnapshot = this.attemptSession.open(
			challenge,
			openedAttempt,
		);
	}

	private async retryAttempts(): Promise<void> {
		await this.loadAttempts(this.requireSelectedChallengeId());
	}

	private requireSelectedChallengeId(): string {
		const challengeId = this.attemptCatalogSnapshot.challengeId;
		if (!challengeId) {
			throw new Error('Choose a challenge first.');
		}
		return challengeId;
	}

	private async runChecks(): Promise<void> {
		const current = this.attemptSessionSnapshot;
		if (!current) {
			throw new Error('Open an attempt before running tests.');
		}

		this.attemptSessionSnapshot = this.attemptSession.startTestRun();
		this.render();
		try {
			const workspace = await this.learnerWorkspace.ensureWorkspace(
				current.attempt,
			);
			const evidence = await this.localTestRunner.run({
				attemptId: current.attempt.id,
				workspacePath: workspace.challengeRootUri.fsPath,
				environmentPath: workspace.attemptRootUri.fsPath,
			});
			this.attemptSessionSnapshot = this.attemptSession.completeTestRun(evidence);
		} catch (error) {
			this.attemptSessionSnapshot = this.attemptSession.cancelTestRun();
			throw error;
		}
		this.render();
	}

	private async moveToCurrentStage(): Promise<void> {
		const current = this.attemptSessionSnapshot;
		if (!current) {
			throw new Error('Open an attempt before moving to the current stage.');
		}
		this.attemptSessionSnapshot = await this.attemptSession.moveToCurrentStage();
		this.render();
	}

	private async openWorkspace(): Promise<void> {
		if (!this.attemptSessionSnapshot) {
			throw new Error('Start the challenge before opening starter code.');
		}
		await this.learnerWorkspace.openWorkspace(
			this.attemptSessionSnapshot.attempt,
		);
		void vscode.window.showInformationMessage(
			'CodeArc opened the learner folder. Your changes will be preserved.',
		);
	}

	private async openTestCase(testPath: string, testName: string): Promise<void> {
		if (!this.attemptSessionSnapshot) {
			throw new Error('Open an attempt before viewing its public tests.');
		}
		await this.learnerWorkspace.openTestCase(
			this.attemptSessionSnapshot.attempt,
			testPath,
			testName,
		);
	}

	private async loadChallengeCatalog(force = false): Promise<void> {
		if (!force && this.catalogSnapshot.status === ChallengeCatalogStatus.Ready) {
			return;
		}
		if (this.catalogLoad) {
			return this.catalogLoad;
		}

		const load = this.challengeCatalog.load();
		this.catalogSnapshot = this.challengeCatalog.getSnapshot();
		this.render();
		this.catalogLoad = load
			.then((snapshot) => {
				this.catalogSnapshot = snapshot;
				this.render();
			})
			.finally(() => {
				this.catalogLoad = undefined;
			});
		return this.catalogLoad;
	}

	private async loadAttempts(challengeId: string): Promise<void> {
		const load = this.attemptCatalog.load(challengeId);
		this.attemptCatalogSnapshot = this.attemptCatalog.getSnapshot();
		this.render();
		this.attemptCatalogSnapshot = await load;
		this.render();
	}

	private render(): void {
		const view = this.view;
		if (!view) {
			return;
		}

		const revision = ++this.renderRevision;
		void createChallengeViewHtml(
			this.markdownRenderer,
			{
				cspSource: view.webview.cspSource,
				markdownHighlightStylesheetUri: this.markdownHighlightStylesheetUri,
			},
			this.catalogSnapshot,
			this.attemptCatalogSnapshot,
			this.attemptSessionSnapshot,
		)
			.then((html) => {
				if (this.view === view && revision === this.renderRevision) {
					view.webview.html = html;
				}
			})
			.catch((error: unknown) => {
				if (this.view !== view || revision !== this.renderRevision) {
					return;
				}

				const message = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`CodeArc: ${message}`);
			});
	}

	private async submitSolution(): Promise<void> {
		await this.runChecks();

		const pendingSubmission = this.attemptSession.submitTestResults();

		this.attemptSessionSnapshot = this.attemptSession.getSnapshot();
		this.render();

		try {
			await pendingSubmission;
		} finally {
			this.attemptSessionSnapshot = this.attemptSession.getSnapshot();
			this.render();
		}
	}
}

type ViewMessage =
	| { type: ChallengeViewAction.SelectChallenge; challengeId: string }
	| { type: ChallengeViewAction.StartNewAttempt; challengeId: string }
	| { type: ChallengeViewAction.ContinueAttempt; attemptId: string }
	| { type: ChallengeViewAction.SelectAttemptLevel; levelId: string }
	| { type: ChallengeViewAction.OpenTestCase; testPath: string; testName: string }
	| {
		type:
			| ChallengeViewAction.RetryCatalog
			| ChallengeViewAction.RetryAttempts
			| ChallengeViewAction.BackToCatalog
			| ChallengeViewAction.RunChecks
			| ChallengeViewAction.OpenWorkspace
			| ChallengeViewAction.SubmitSolution
			| ChallengeViewAction.CurrentStage;
	}
	| { type: ChallengeViewAction.SelectSection; section: ChallengeSection };

function isViewMessage(value: unknown): value is ViewMessage {
	if (typeof value !== 'object' || value === null || !('type' in value)) {
		return false;
	}

	if (value.type === ChallengeViewAction.SelectSection) {
		return 'section' in value && isChallengeSection(value.section);
	}

	if (value.type === ChallengeViewAction.SelectChallenge
		|| value.type === ChallengeViewAction.StartNewAttempt) {
		return 'challengeId' in value
			&& typeof value.challengeId === 'string'
			&& value.challengeId.length > 0;
	}
	if (value.type === ChallengeViewAction.ContinueAttempt) {
		return 'attemptId' in value
			&& typeof value.attemptId === 'string'
			&& value.attemptId.length > 0;
	}
	if (value.type === ChallengeViewAction.SelectAttemptLevel) {
		return 'levelId' in value
			&& typeof value.levelId === 'string'
			&& value.levelId.length > 0;
	}
	if (value.type === ChallengeViewAction.OpenTestCase) {
		return 'testPath' in value
			&& typeof value.testPath === 'string'
			&& value.testPath.length > 0
			&& 'testName' in value
			&& typeof value.testName === 'string'
			&& value.testName.length > 0;
	}

	return typeof value.type === 'string'
		&& Object.values(ChallengeViewAction).includes(value.type as ChallengeViewAction);
}

function isChallengeSection(value: unknown): value is ChallengeSection {
	return typeof value === 'string'
		&& Object.values(ChallengeSection).includes(value as ChallengeSection);
}
