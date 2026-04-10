{ lib, integrations, ... }:
lib.mkIf (builtins.elem "vim" integrations.ids) {
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    vimAlias = true;
    viAlias = true;
    withRuby = false;
    withPython3 = false;
  };
}
