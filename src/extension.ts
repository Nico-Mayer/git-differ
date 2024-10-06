import * as vscode from "vscode";
import { API, GitExtension, RefType } from "./git";

type Branch = {
  tags: (string | undefined)[];
  type: RefType;
  name?: string;
  commit?: string;
  remote?: string;
};

export function activate(context: vscode.ExtensionContext) {
  const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git")!.exports;
  const gitApi: API = gitExtension.getAPI(1);

  const compareWithBranch = vscode.commands.registerCommand(
    "git-differ.compareWithBranch",
    async (uri: vscode.Uri | undefined) => {
      if (!uri) {
        uri = vscode.window.activeTextEditor?.document.uri;
      }
      if (!uri) {
        vscode.window.showErrorMessage("No file selected");
        return;
      }
      const localOnly = vscode.workspace
        .getConfiguration("git-differ")
        .get<boolean>("localOnly", false);
      const branches = await getBranches(gitApi, uri, !localOnly);

      const quickPickItems: vscode.QuickPickItem[] = genBranchQuickPickItems(branches, localOnly);

      const selectedBranch = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: "Select a branch to compare with",
      });

      if (!selectedBranch) {
        vscode.window.showErrorMessage("No branch selected");
        return;
      }

      const branch = branches.find((branch) => branch.name === selectedBranch.label);
      if (!branch) {
        vscode.window.showErrorMessage(`Branch not found: ${selectedBranch.label}`);
        return;
      }

      if (branch.name === undefined) {
        vscode.window.showErrorMessage(`Branch Name is undefined: ${selectedBranch.label}`);
        return;
      }

      const gitUri = gitApi.toGitUri(uri, branch.name);
      const filePath = uri.path.split("/").pop() || uri.path;

      vscode.commands.executeCommand(
        "vscode.diff",
        gitUri,
        uri,
        `${branch.name} compared with "${filePath}"`
      );
    }
  );

  const compareWithCommit = vscode.commands.registerCommand(
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

  context.subscriptions.push(compareWithBranch, compareWithCommit);
}

export function deactivate() {}

async function getBranches(gitApi: API, uri: vscode.Uri, remote: boolean): Promise<Branch[]> {
  const repo = gitApi.getRepository(uri);

  if (!repo) {
    vscode.window.showErrorMessage(`Repository not found for URI: ${uri.toString()}`);
    return [];
  }

  const branches = await repo.getBranches({ remote });

  const tags = await repo.getRefs({ pattern: "refs/tags/*" });

  const branchesWithTags = branches.map((branch) => {
    const branchTags = tags.filter((tag) => tag.commit === branch.commit);
    return {
      ...branch,
      tags: branchTags.map((tag) => tag.name),
    };
  });

  return branchesWithTags;
}

function genBranchQuickPickItems(branches: Branch[], localOnly: boolean): vscode.QuickPickItem[] {
  const localBranches = branches.filter((branch) => {
    if (!branch.remote) {
      return branch;
    }
  });

  const remoteBranches = branches.filter((branch) => {
    if (branch.remote) {
      return branch;
    }
  });

  const toQuickPickItems = (branches: Branch[], iconId: string): vscode.QuickPickItem[] => {
    return branches.map((branch) => {
      return {
        label: branch.name || "unknown",
        iconPath: new vscode.ThemeIcon(iconId),
        description: branch.tags.length ? `Tags: ${branch.tags.join(", ")}` : "",
      };
    });
  };

  const localBranchesItems = toQuickPickItems(localBranches, "git-branch");
  const remoteBranchesItems = toQuickPickItems(remoteBranches, "cloud");

  const divider = (label: string): vscode.QuickPickItem => {
    return {
      label,
      kind: -1,
    };
  };

  const dividerRemote = divider("remote branches");
  const dividerLocal = divider("local branches");

  if (localOnly) {
    return [dividerLocal, ...localBranchesItems];
  }

  return [dividerLocal, ...localBranchesItems, dividerRemote, ...remoteBranchesItems];
}
