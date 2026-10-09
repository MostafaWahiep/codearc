import * as vscode from 'vscode';
import { registerStartChallengeCommand } from './commands/startChallenge';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(registerStartChallengeCommand());
}

export function deactivate() {}
