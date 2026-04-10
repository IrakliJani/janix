{ lib, llmPackages, integrations, ... }:
lib.mkIf (builtins.elem "pi" integrations.ids) {
  home.packages = [ llmPackages.pi ];
}
