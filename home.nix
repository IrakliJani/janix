{ config, pkgs, ... }:

{
  home.username = "root";
  home.homeDirectory = "/root";
  home.stateVersion = "25.11";

  nixpkgs.config.allowUnfree = true;

  # Required for non-NixOS Linux (Docker container)
  targets.genericLinux.enable = true;

  programs.home-manager.enable = true;

  home.packages = with pkgs; [
    claude-code
    libiconv
  ];

  home.sessionVariables = {
    LANG = "C.UTF-8";
    LC_ALL = "C.UTF-8";
  };

  programs.zsh = {
    enable = true;

    oh-my-zsh = {
      enable = true;
      plugins = [
        "git"
      ];
      theme = "simple";
    };

    history = {
      append = true;
      size = 100000;
      save = 100000;
    };

    syntaxHighlighting.enable = true;
    autosuggestion.enable = true;
    historySubstringSearch.enable = true;
  };

  programs.git = {
    enable = true;
  };
}
