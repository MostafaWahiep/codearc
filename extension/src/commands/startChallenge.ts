import * as vscode from 'vscode';

const commandId = 'codearc.startChallenge';

export function registerStartChallengeCommand(): vscode.Disposable {
	return vscode.commands.registerCommand(commandId, () => {
		void vscode.window.showInformationMessage('Starting challenge!');
	});
}
