/**
 * cnstudio integration example — how ANOTHER VS Code extension drives the
 * cnstudio Studio extension through the typed `cnstudio/vscode` API.
 *
 * `getStudioApi` returns the live `StudioCtx` — the whole engine — so you can do
 * anything the Studio can: read the model, run tracked changes, register code
 * components, undo/redo, switch arenas, and so on.
 */
import * as vscode from "vscode";
import { getStudioApi, type StudioCtx } from "cnstudio/vscode";

let studio: StudioCtx | null = null;

export async function activate(context: vscode.ExtensionContext) {
  studio = (await getStudioApi(vscode.extensions)) ?? null;
  if (!studio) {
    vscode.window.showErrorMessage("cnstudio extension not found.");
    return;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("my-ext.listComponents", listComponents),
    vscode.commands.registerCommand("my-ext.registerChart", registerChart)
  );
}

export function deactivate() {
  studio = null;
}

/** Read the current document straight off the engine. */
function listComponents() {
  if (!studio) return;
  const names = studio.model.site.components.map((c) => c.name);
  vscode.window.showInformationMessage(`Components: ${names.join(", ") || "(none)"}`);
}

/** Contribute a code component to the Insert palette + run a tracked change. */
function registerChart() {
  if (!studio) return;

  // The full engine surface is available — e.g. register a code component…
  studio.codeComponents.register("Chart", { kind: "line", title: "Untitled" });

  // …and mutate the model through a tracked, undoable change.
  studio.change((tx) => {
    // tx.insertChild(path, node, index), tx.setProp(path, key, value), tx.remove(path), …
    void tx;
  });

  if (studio.history.canUndo) {
    // studio.history.undo() / studio.history.redo() are available too.
  }
}
