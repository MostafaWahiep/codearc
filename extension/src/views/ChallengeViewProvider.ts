import * as vscode from 'vscode';
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
	private renderRevision = 0;
	private markdownHighlightStylesheetUri: string | undefined;

	public constructor(
		private readonly session: PrototypeSession,
		private readonly learnerWorkspace: LearnerWorkspaceService,
		private readonly markdownRenderer: MarkdownRenderer,
	) {
		this.snapshot = session.getSnapshot();
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
	}

	public async startChallenge(): Promise<void> {
		this.snapshot = await this.session.start();
		this.render();
	}

	public async showChallenge(): Promise<void> {
		if (!this.snapshot.challenge) {
			await this.startChallenge();
		}
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!isViewMessage(message)) {
			return;
		}

		try {
			switch (message.type) {
				case ChallengeViewAction.Start:
				case ChallengeViewAction.Restart:
					await this.startChallenge();
					return;
				case ChallengeViewAction.RunChecks:
					await this.runChecks();
					return;
				case ChallengeViewAction.SelectSection:
					this.snapshot = this.session.selectSection(message.section);
					break;
				case ChallengeViewAction.OpenStarter:
					await this.openStarter();
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

	private async openStarter(): Promise<void> {
		const challenge = this.snapshot.challenge;
		if (!challenge) {
			throw new Error('Start the challenge before opening starter code.');
		}

		await this.learnerWorkspace.openStarter(challenge);
		void vscode.window.showInformationMessage(
			'CodeArc opened an editable learner copy. Your changes will be preserved.',
		);
	}

	private render(): void {
		const view = this.view;
		if (!view) {
			return;
		}

		const revision = ++this.renderRevision;
		void createChallengeViewHtml(this.snapshot, this.markdownRenderer, {
			cspSource: view.webview.cspSource,
			markdownHighlightStylesheetUri: this.markdownHighlightStylesheetUri,
		})
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
	| {
		type:
			| ChallengeViewAction.Start
			| ChallengeViewAction.Restart
			| ChallengeViewAction.RunChecks
			| ChallengeViewAction.OpenStarter
			| ChallengeViewAction.BeginRefactor
			| ChallengeViewAction.Next;
	}
	| { type: ChallengeViewAction.SelectSection; section: ChallengeSection };

function isViewMessage(value: unknown): value is ViewMessage {
	if (typeof value !== 'object' || value === null || !('type' in value)) {
		return false;
	}

	if (value.type === ChallengeViewAction.SelectSection) {
		return 'section' in value && isChallengeSection(value.section);
	}

	return typeof value.type === 'string'
		&& Object.values(ChallengeViewAction).includes(value.type as ChallengeViewAction);
}

function isChallengeSection(value: unknown): value is ChallengeSection {
	return typeof value === 'string'
		&& Object.values(ChallengeSection).includes(value as ChallengeSection);
}
