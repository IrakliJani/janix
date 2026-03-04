import type { SelectableIntegration } from "./types.js";

export const starship: SelectableIntegration = {
  id: "starship",
  label: "Starship",
  category: "shell-tool",
  defaultSelected: true,
  dockerfileLines: [],
  volumes: [],
  env: {},
  initCommands: [],
  credentials: [],
  nixConfig: {},
};
