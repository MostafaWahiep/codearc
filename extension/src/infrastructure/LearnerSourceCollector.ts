import * as vscode from 'vscode';
import type { AttemptDto, SubmissionSourceFile } from '../backend/BackendTypes';
import type { LearnerWorkspaceService } from './LearnerWorkspaceService';

const excludedDirectories = new Set([
	'__pycache__',
	'env',
	'node_modules',
	'venv',
]);

export class LearnerSourceCollector {
	public constructor(
		private readonly learnerWorkspace: LearnerWorkspaceService,
	) {}

	public async collect(attempt: AttemptDto): Promise<SubmissionSourceFile[]> {
		const workspace = await this.learnerWorkspace.ensureWorkspace(attempt);
		const files: SubmissionSourceFile[] = [];
		await this.collectDirectory(workspace.challengeRootUri, [], files);

		if (files.length === 0) {
			throw new Error('No learner source files were found to submit.');
		}

		return files.sort((left, right) => comparePaths(left.path, right.path));
	}

	private async collectDirectory(
		root: vscode.Uri,
		relativeSegments: string[],
		files: SubmissionSourceFile[],
	): Promise<void> {
		const directory = vscode.Uri.joinPath(root, ...relativeSegments);
		const entries = await vscode.workspace.fs.readDirectory(directory);

		for (const [name, fileType] of entries) {
			if ((fileType & vscode.FileType.SymbolicLink) !== 0) {
				continue;
			}

			const childSegments = [...relativeSegments, name];
			if ((fileType & vscode.FileType.Directory) !== 0) {
				if (!name.startsWith('.') && !excludedDirectories.has(name)) {
					await this.collectDirectory(root, childSegments, files);
				}
				continue;
			}

			if ((fileType & vscode.FileType.File) === 0) {
				continue;
			}
			if (name.startsWith('.')) {
				continue;
			}

			const file = vscode.Uri.joinPath(root, ...childSegments);
			const bytes = await vscode.workspace.fs.readFile(file);
			const content = decodeTextFile(bytes);
			if (content === undefined) {
				continue;
			}

			files.push({
				path: childSegments.join('/'),
				content,
			});
		}
	}
}

function comparePaths(left: string, right: string): number {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}
	return 0;
}

function decodeTextFile(bytes: Uint8Array): string | undefined {
	if (bytes.includes(0)) {
		return undefined;
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
}
