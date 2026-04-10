{ pkgs, ... }:
{
  home.username = "root";
  home.homeDirectory = "/root";
  home.stateVersion = "25.11";

  programs.zsh.enable = true;

  home.packages = [ pkgs.less ];

  programs.home-manager.enable = true;
}
