export interface Credential {
  label: string;
  resolve: () => Promise<string | null>;
  containerPath: string;
  requiresConsent?: boolean;
}

interface BaseIntegration {
  id: string;
  label: string;
  volumes: { name: string; path: string }[];
  env: Record<string, string>;
  credentials: Credential[];
  nixConfig: Record<string, string>;
}

export interface SelectableIntegration extends BaseIntegration {
  category: "agent" | "shell-tool";
  defaultSelected: boolean;
}

export interface DetectableIntegration extends BaseIntegration {
  category: "package-manager";
  detect: (projectRoot: string) => Promise<boolean>;
}

export type Integration = SelectableIntegration | DetectableIntegration;
