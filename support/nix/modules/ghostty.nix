{ pkgs, lib, integrations, ... }:
lib.mkIf (builtins.elem "ghostty" integrations.ids) {
  home.packages = [ pkgs.ghostty.terminfo ];
}
