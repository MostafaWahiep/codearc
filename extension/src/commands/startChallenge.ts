import * as vscode from 'vscode';
import type { ChallengeViewProvider } from '../views/ChallengeViewProvider';

const commandId = 'codearc.startChallenge';

export function registerStartChallengeCommand(
	viewProvider: ChallengeViewProvider,
): vscode.Disposable {
	return vscode.commands.registerCommand(commandId, async () => {
		try {
			await viewProvider.showChallenge();
			await vscode.commands.executeCommand('codearc.challengeView.focus');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await vscode.window.showErrorMessage(`Could not start challenge: ${message}`);
		}
	});
}
