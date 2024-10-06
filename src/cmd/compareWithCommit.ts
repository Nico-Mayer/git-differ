import * as vscode from "vscode";
import { API } from "../git";

export function newCompareWithCommit(gitApi: API): vscode.Disposable {
  return vscode.commands.registerCommand(
    "git-differ.compareWithCommit",
    async (uri: vscode.Uri | undefined) => {
      if (!uri) {
        uri = vscode.window.activeTextEditor?.document.uri;
      }
      if (!uri) {
        vscode.window.showErrorMessage("No file selected");
        return;
      }
      const repo = gitApi.getRepository(uri);

      if (!repo) {
        vscode.window.showErrorMessage("No repository found");
        return;
      }

      const commitHistoryLength = vscode.workspace
        .getConfiguration("git-differ")
        .get<number>("commitHistoryLength", 1000);

      try {
        const filePath = repo.rootUri.fsPath
          ? uri.fsPath.replace(repo.rootUri.fsPath + "/", "")
          : uri.fsPath;
        const commits = await repo.log({ maxEntries: commitHistoryLength, path: filePath });

        commits.sort((a, b) => {
          if (a.commitDate === undefined) {
            return -1;
          }
          if (b.commitDate === undefined) {
            return 1;
          }
          return b.commitDate.getTime() - a.commitDate.getTime();
        });

        const quickPickItems: vscode.QuickPickItem[] = commits.map((commit) => {
          return {
            label: commit.hash,
            description: `${commit.commitDate?.toUTCString()}`,
            detail: `${commit.authorName}: ${commit.message}`,
          };
        });

        const selectedCommit = await vscode.window.showQuickPick(quickPickItems, {
          placeHolder: "Select a branch to compare with or search commit hash",
        });

        if (selectedCommit) {
          const selectedCommitHash = selectedCommit.label;
          const gitUri = gitApi.toGitUri(uri, selectedCommitHash);

          await vscode.commands.executeCommand(
            "vscode.diff",
            gitUri,
            uri,
            `Comparing file changes with commit ${selectedCommitHash}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`An error occurred: ${error}`);
      }
    }
  );
}
