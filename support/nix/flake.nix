{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    llm-agents = {
      url = "github:numtide/llm-agents.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    { nixpkgs, home-manager, llm-agents, ... }:
    let
      linuxSystems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      mkHome =
        system:
        home-manager.lib.homeManagerConfiguration {
          pkgs = import nixpkgs { inherit system; };
          modules = [
            ./modules/base.nix
            ./modules/claude.nix
            ./modules/git.nix
            ./modules/ghostty.nix
            ./modules/pi.nix
            ./modules/ohmyposh.nix
            ./modules/vim.nix
          ];
          extraSpecialArgs = {
            llmPackages = llm-agents.packages.${system};
            integrations = import ./integrations.nix;
          };
        };
    in
    {
      homeConfigurations = builtins.listToAttrs (
        map (system: {
          name = "root-${system}";
          value = mkHome system;
        }) linuxSystems
      );
    };
}
