{ lib, integrations, ... }:
lib.mkIf (builtins.elem "git" integrations.ids) {
  programs.git = {
    enable = true;
    settings = {
      user.name = (integrations.git or { }).userName or "";
      user.email = (integrations.git or { }).userEmail or "";
      safe.directory = "*";
      push.autoSetupRemote = true;
    };
  };
}
