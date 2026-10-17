import * as path from 'node:path';
import * as vscode from 'vscode';
import { AttemptCatalog } from './application/AttemptCatalog';
import { ChallengeCatalog } from './application/ChallengeCatalog';
import { ChallengeController } from './application/ChallengeController';
import { PrototypeSession } from './application/PrototypeSession';
import { HttpBackendClient } from './backend/HttpBackendClient';
import { registerStartChallengeCommand } from './commands/startChallenge';
import { FileChallengeRepository } from './infrastructure/FileChallengeRepository';
import { LearnerWorkspaceService } from './infrastructure/LearnerWorkspaceService';
import { MockTestRunner } from './infrastructure/MockTestRunner';
import { VsCodeMarkdownRenderer } from './infrastructure/VsCodeMarkdownRenderer';
import { ChallengeViewProvider } from './views/ChallengeViewProvider';

export function activate(context: vscode.ExtensionContext) {
	const prototypeUserId = '11111111-1111-4111-8111-111111111111';
	const backendUrl = vscode.workspace
		.getConfiguration('codearc')
		.get<string>('backendUrl', 'http://127.0.0.1:5000/api/v1');
	const backendClient = new HttpBackendClient(backendUrl);
	const challengeCatalog = new ChallengeCatalog(backendClient);
	const attemptCatalog = new AttemptCatalog(backendClient, prototypeUserId);
	const challengeRoot = path.resolve(
		context.extensionPath,
		'..',
		'challenges',
		'search-engine',
		'v1',
	);
	const repository = new FileChallengeRepository(challengeRoot);
	const controller = new ChallengeController(repository);
	const session = new PrototypeSession(controller, new MockTestRunner());
	const learnerWorkspace = new LearnerWorkspaceService(context.globalStorageUri);
	const markdownRenderer = new VsCodeMarkdownRenderer();
	const viewProvider = new ChallengeViewProvider(
		session,
		challengeCatalog,
		attemptCatalog,
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
