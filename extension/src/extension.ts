import * as path from 'node:path';
import * as vscode from 'vscode';
import { AttemptCatalog } from './application/AttemptCatalog';
import { AttemptSession } from './application/AttemptSession';
import { ChallengeCatalog } from './application/ChallengeCatalog';
import { HttpBackendClient } from './backend/HttpBackendClient';
import { registerStartChallengeCommand } from './commands/startChallenge';
import { LearnerWorkspaceService } from './infrastructure/LearnerWorkspaceService';
import { PytestRunner } from './infrastructure/PytestRunner';
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
	const attemptSession = new AttemptSession(backendClient);
	const challengeRoot = path.resolve(
		context.extensionPath,
		'..',
		'challenges',
		'search-engine',
		'v1',
	);
	const learnerWorkspace = new LearnerWorkspaceService(
		context.globalStorageUri,
		[
			{
				challengeId: 'search-engine',
				starterPath: path.join(challengeRoot, 'starter'),
				entrypointPath: path.join(challengeRoot, 'starter', 'search_engine.py'),
			},
		],
	);
	const localTestRunner = new PytestRunner(backendClient);
	const markdownRenderer = new VsCodeMarkdownRenderer();
	const viewProvider = new ChallengeViewProvider(
		challengeCatalog,
		attemptCatalog,
		attemptSession,
		learnerWorkspace,
		localTestRunner,
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
