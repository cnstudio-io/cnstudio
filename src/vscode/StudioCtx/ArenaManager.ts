import type { Component } from "../../engine/model";
import type { Listenable } from "../events";
import type { Frame } from "./index";

/** A workspace: one component and its frames. */
export interface Arena {
  name: string;
  component: Component;
  frames: Frame[];
}

/** Workspaces — one arena per component. */
export interface ArenasApi {
  readonly all: Arena[];
  readonly current: Arena;
  readonly onFramesChanged: Listenable;
  /** Make `name` the active arena. */
  switchTo(name: string): void;
  /** Add a new component (and arena). */
  add(name: string): void;
  /** Add an artboard frame to the current arena. */
  addFrame(): void;
  rename(oldName: string, newName: string): void;
  remove(name: string): void;
}
