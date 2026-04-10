{ lib, integrations, ... }:
lib.mkIf (builtins.elem "ohmyposh" integrations.ids) {
  programs.oh-my-posh = {
    enable = true;
    enableZshIntegration = true;
    useTheme = "pure";
  };
}
