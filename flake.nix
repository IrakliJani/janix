{
  description = "Nix flake for janix development shell";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      # This covers typical Linux and macOS architectures.
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = f: nixpkgs.lib.genAttrs supportedSystems (system: f system);
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
              allowUnfreePredicate =
                pkg:
                builtins.elem (nixpkgs.lib.getName pkg) [
                ];
            };
          };
        in
        {
          default = pkgs.mkShell {
            name = "janix-dev-shell";

            buildInputs = with pkgs; [
              nodejs
            ];

            shellHook = ''
              echo "🐚 Entering janix development shell for ${system}..."
            '';
          };
        }
      );
    };
}
