import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	test('registers the start challenge command', async () => {
		await vscode.commands.executeCommand('codearc.startChallenge');
	});
});
