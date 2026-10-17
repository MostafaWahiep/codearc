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
import {
	ChallengeSection,
	PrototypeSession,
	type PrototypeSessionSnapshot,
} from '../application/PrototypeSession';
import { LearnerWorkspaceService } from '../infrastructure/LearnerWorkspaceService';
import { ChallengeViewAction } from './ChallengeViewAction';
import type { MarkdownRenderer } from './MarkdownRenderer';
import { createChallengeViewHtml } from './challengeViewHtml';

export class ChallengeViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'codearc.challengeView';

	private view: vscode.WebviewView | undefined;
	private snapshot: PrototypeSessionSnapshot;
	private catalogSnapshot: ChallengeCatalogSnapshot;
	private attemptCatalogSnapshot: AttemptCatalogSnapshot;
	private attemptSessionSnapshot: AttemptSessionSnapshot | undefined;
	private catalogLoad: Promise<void> | undefined;
	private renderRevision = 0;
	private markdownHighlightStylesheetUri: string | undefined;

	public constructor(
		private readonly session: PrototypeSession,
		private readonly challengeCatalog: ChallengeCatalog,
		private readonly attemptCatalog: AttemptCatalog,
		private readonly attemptSession: AttemptSession,
		private readonly learnerWorkspace: LearnerWorkspaceService,
		private readonly markdownRenderer: MarkdownRenderer,
	) {
		this.snapshot = session.getSnapshot();
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
		if (!this.attemptSessionSnapshot && !this.snapshot.challenge) {
			await this.startChallenge();
		}
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
				case ChallengeViewAction.Restart:
					await this.startNewAttempt(this.requireSelectedChallengeId());
					return;
				case ChallengeViewAction.RetryCatalog:
					await this.loadChallengeCatalog(true);
					return;
				case ChallengeViewAction.RunChecks:
					await this.runChecks();
					return;
				case ChallengeViewAction.SelectSection:
					if (this.attemptSessionSnapshot) {
						this.attemptSessionSnapshot = this.attemptSession.selectSection(
							message.section,
						);
					} else {
						this.snapshot = this.session.selectSection(message.section);
					}
					break;
				case ChallengeViewAction.SelectLevel:
					this.snapshot = this.session.selectLevel(message.levelNumber);
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
				case ChallengeViewAction.BeginRefactor:
					this.snapshot = this.session.beginRefactor();
					break;
				case ChallengeViewAction.Next:
					this.snapshot = this.session.advanceToNextLevel();
					break;
			}

			this.render();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await vscode.window.showErrorMessage(`CodeArc: ${message}`);
			this.snapshot = this.session.getSnapshot();
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
		const checkRun = this.session.runChecks((snapshot) => {
			this.snapshot = snapshot;
			this.render();
		});
		this.snapshot = this.session.getSnapshot();
		this.render();

		this.snapshot = await checkRun;
		this.render();
	}

	private async openWorkspace(): Promise<void> {
		const challenge = this.snapshot.challenge;
		if (!challenge) {
			throw new Error('Start the challenge before opening starter code.');
		}
		if (!challenge.isViewingLatestLevel) {
			throw new Error('Return to the latest level before opening the evolving codebase.');
		}

		await this.learnerWorkspace.openWorkspace(challenge);
		void vscode.window.showInformationMessage(
			'CodeArc opened the learner folder. Your changes will be preserved.',
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
			this.snapshot,
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
}

type ViewMessage =
	| { type: ChallengeViewAction.SelectChallenge; challengeId: string }
	| { type: ChallengeViewAction.StartNewAttempt; challengeId: string }
	| { type: ChallengeViewAction.ContinueAttempt; attemptId: string }
	| { type: ChallengeViewAction.SelectAttemptLevel; levelId: string }
	| {
		type:
			| ChallengeViewAction.Restart
			| ChallengeViewAction.RetryCatalog
			| ChallengeViewAction.RetryAttempts
			| ChallengeViewAction.BackToCatalog
			| ChallengeViewAction.RunChecks
			| ChallengeViewAction.OpenWorkspace
			| ChallengeViewAction.BeginRefactor
			| ChallengeViewAction.Next;
	}
	| { type: ChallengeViewAction.SelectSection; section: ChallengeSection }
	| { type: ChallengeViewAction.SelectLevel; levelNumber: number };

function isViewMessage(value: unknown): value is ViewMessage {
	if (typeof value !== 'object' || value === null || !('type' in value)) {
		return false;
	}

	if (value.type === ChallengeViewAction.SelectSection) {
		return 'section' in value && isChallengeSection(value.section);
	}

	if (value.type === ChallengeViewAction.SelectLevel) {
		return 'levelNumber' in value
			&& typeof value.levelNumber === 'number'
			&& Number.isInteger(value.levelNumber);
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

	return typeof value.type === 'string'
		&& Object.values(ChallengeViewAction).includes(value.type as ChallengeViewAction);
}

function isChallengeSection(value: unknown): value is ChallengeSection {
	return typeof value === 'string'
		&& Object.values(ChallengeSection).includes(value as ChallengeSection);
}
