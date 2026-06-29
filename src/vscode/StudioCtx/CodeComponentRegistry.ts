/** A registered code component (name + insert defaults). */
export interface CodeComponentReg {
  name: string;
  defaultProps?: Record<string, unknown>;
}

/** Code-component registry (the Insert palette's code items). */
export interface CodeComponentsApi {
  register(name: string, defaultProps?: Record<string, unknown>): void;
  has(type: string): boolean;
  readonly all: CodeComponentReg[];
}
