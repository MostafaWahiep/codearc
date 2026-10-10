import * as path from 'node:path';
import * as vscode from 'vscode';
import { ChallengeController } from './application/ChallengeController';
import { PrototypeSession } from './application/PrototypeSession';
import { registerStartChallengeCommand } from './commands/startChallenge';
import { FileChallengeRepository } from './infrastructure/FileChallengeRepository';
import { LearnerWorkspaceService } from './infrastructure/LearnerWorkspaceService';
import { MockTestRunner } from './infrastructure/MockTestRunner';
import { VsCodeMarkdownRenderer } from './infrastructure/VsCodeMarkdownRenderer';
import { ChallengeViewProvider } from './views/ChallengeViewProvider';

export function activate(context: vscode.ExtensionContext) {
	const challengeRoot = path.resolve(
		context.extensionPath,
		'..',
		'challenges',
		'search-engine',
	);
	const repository = new FileChallengeRepository(challengeRoot);
	const controller = new ChallengeController(repository);
	const session = new PrototypeSession(controller, new MockTestRunner());
	const learnerWorkspace = new LearnerWorkspaceService(context.globalStorageUri);
	const markdownRenderer = new VsCodeMarkdownRenderer();
	const viewProvider = new ChallengeViewProvider(
		session,
		learnerWorkspace,
		markdownRenderer,
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			ChallengeViewProvider.viewType,
			viewProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
			},
		),
		registerStartChallengeCommand(viewProvider),
	);
}

export function deactivate() {}
