import type { SelectableIntegration } from "./types.js";

export const vim: SelectableIntegration = {
  id: "vim",
  label: "Neovim",
  category: "shell-tool",
  defaultSelected: true,
  dockerfileLines: [],
  volumes: [],
  env: {},
  initCommands: [],
  credentials: [],
  nixConfig: {},
};
