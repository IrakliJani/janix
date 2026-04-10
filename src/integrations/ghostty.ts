import type { SelectableIntegration } from "./types.js";

export const ghostty: SelectableIntegration = {
  id: "ghostty",
  label: "Ghostty terminfo",
  category: "shell-tool",
  defaultSelected: false,
  dockerfileLines: [],
  volumes: [],
  env: {},
  initCommands: [],
  credentials: [],
  nixConfig: {},
};
