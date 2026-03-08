export interface Credential {
  label: string;
  resolve: () => string | null;
  containerPath: string;
  requiresConsent?: boolean;
}

interface BaseIntegration {
  id: string;
  label: string;
  dockerfileLines: string[];
  volumes: { name: string; path: string }[];
  env: Record<string, string>;
  initCommands: string[];
  credentials: Credential[];
  nixConfig: Record<string, string>;
}

export interface SelectableIntegration extends BaseIntegration {
  category: "agent" | "shell-tool";
  defaultSelected: boolean;
}

export interface DetectableIntegration extends BaseIntegration {
  category: "package-manager";
  detect: (projectRoot: string) => boolean;
}

export type Integration = SelectableIntegration | DetectableIntegration;
