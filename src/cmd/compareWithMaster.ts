import * as vscode from "vscode";
import { API } from "../git";
import { findMasterBranch, executeDiffComparison } from "./compareWithBranch";

export function newCompareWithMaster(gitApi: API): vscode.Disposable {
  return vscode.commands.registerCommand(
    "git-differ.compareWithMaster",
    async (uri: vscode.Uri | undefined) => {
      if (!uri) {
        uri = vscode.window.activeTextEditor?.document.uri;
      }
      if (!uri) {
        vscode.window.showErrorMessage("No file selected");
        return;
      }

      try {
        const masterBranch = await findMasterBranch(gitApi, uri);

        if (!masterBranch || !masterBranch.name) {
          vscode.window.showErrorMessage("Could not find master or main branch");
          return;
        }

        await executeDiffComparison(gitApi, uri, masterBranch.name);
      } catch (error) {
        vscode.window.showErrorMessage(`An error occurred: ${error}`);
      }
    }
  );
}
