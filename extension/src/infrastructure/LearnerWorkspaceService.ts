import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ChallengeSnapshot } from '../application/ChallengeController';

export class LearnerWorkspaceService {
	public constructor(private readonly storageRoot: vscode.Uri) {}

	public async openWorkspace(challenge: ChallengeSnapshot): Promise<void> {
		const relativeEntrypoint = path.relative(
			challenge.starterPath,
			challenge.entrypointPath
		);

		if (
			path.isAbsolute(relativeEntrypoint) ||
			relativeEntrypoint.startsWith(`..${path.sep}`) ||
			relativeEntrypoint === '..'
		) {
			throw new Error('The challenge entrypoint must be inside its starter directory.');
		}

		const workspacesRoot = vscode.Uri.joinPath(this.storageRoot, 'learner-workspaces');
		const learnerRoot = vscode.Uri.joinPath(workspacesRoot, challenge.id);
		const starterFile = vscode.Uri.joinPath(
			learnerRoot,
			...relativeEntrypoint.split(path.sep)
		);

		await vscode.workspace.fs.createDirectory(workspacesRoot);
		if (!(await uriExists(learnerRoot))) {
			await vscode.workspace.fs.copy(
				vscode.Uri.file(challenge.starterPath),
				learnerRoot,
				{ overwrite: false },
			);
		}

		if (!(await uriExists(starterFile))) {
			throw new Error('The challenge starter entrypoint could not be found.');
		}

		const isAlreadyOpen = vscode.workspace.workspaceFolders?.some(
			(folder) => folder.uri.toString() === learnerRoot.toString(),
		) ?? false;

		if (!isAlreadyOpen) {
			const wasAdded = vscode.workspace.updateWorkspaceFolders(
				vscode.workspace.workspaceFolders?.length ?? 0,
				0,
				{
					uri: learnerRoot,
					name: `CodeArc: ${challenge.title}`,
				},
			);
			if (!wasAdded) {
				throw new Error('The learner workspace could not be added to VS Code.');
			}
		}

		const document = await vscode.workspace.openTextDocument(starterFile);
		await vscode.window.showTextDocument(document, { preview: false });
	}
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}
