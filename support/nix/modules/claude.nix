{ lib, llmPackages, integrations, ... }:
lib.mkIf (builtins.elem "claude" integrations.ids) {
  home.packages = [ llmPackages.claude-code ];

  home.file.".claude.json".text = builtins.toJSON {
    hasCompletedOnboarding = true;
    hasCompletedProjectOnboarding = true;
    theme = "dark";
    projects = {
      ${integrations.workspace} = {
        hasTrustDialogAccepted = true;
        hasCompletedProjectOnboarding = true;
      };
    };
  };
}
