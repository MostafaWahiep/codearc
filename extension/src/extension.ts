import * as vscode from 'vscode';
import { AttemptCatalog } from './application/AttemptCatalog';
import { AttemptSession } from './application/AttemptSession';
import { ChallengeCatalog } from './application/ChallengeCatalog';
import { HttpBackendClient } from './backend/HttpBackendClient';
import { registerStartChallengeCommand } from './commands/startChallenge';
import { LearnerWorkspaceService } from './infrastructure/LearnerWorkspaceService';
import { PytestRunner } from './infrastructure/PytestRunner';
import { PythonRuntimeManager } from './infrastructure/PythonRuntimeManager';
import { VsCodeMarkdownRenderer } from './infrastructure/VsCodeMarkdownRenderer';
import { ChallengeViewProvider } from './views/ChallengeViewProvider';

const PYTHON_RUNTIME_ID = 'python-runner-v1';

export function activate(context: vscode.ExtensionContext) {
	const prototypeUserId = '11111111-1111-4111-8111-111111111111';
	const backendUrl = vscode.workspace
		.getConfiguration('codearc')
		.get<string>('backendUrl', 'http://127.0.0.1:5000/api/v1');
	const backendClient = new HttpBackendClient(backendUrl);
	const challengeCatalog = new ChallengeCatalog(backendClient);
	const attemptCatalog = new AttemptCatalog(backendClient, prototypeUserId);
	const attemptSession = new AttemptSession(backendClient);
	const learnerWorkspace = new LearnerWorkspaceService(
		context.globalStorageUri,
		backendClient,
	);
	const pythonRuntime = createPythonRuntime(context);
	const localTestRunner = new PytestRunner(backendClient, pythonRuntime);
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

	void viewProvider.restoreOpenedWorkspace().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(
			`CodeArc could not restore the opened attempt: ${message}`,
		);
	});
}

export function deactivate() {}

function createPythonRuntime(
	context: vscode.ExtensionContext,
): PythonRuntimeManager {
	return new PythonRuntimeManager({
		rootPath: vscode.Uri.joinPath(
			context.globalStorageUri,
			'runtimes',
			PYTHON_RUNTIME_ID,
		).fsPath,
		requirementsPath: vscode.Uri.joinPath(
			context.extensionUri,
			'resources',
			'python-runner',
			'requirements.txt',
		).fsPath,
	});
}
