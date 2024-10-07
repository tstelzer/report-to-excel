{
  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
    in
    with pkgs;
    {
      devShell.x86_64-linux = mkShell {
        nativeBuildInputs = [ bashInteractive ];
        # see https://github.com/Automattic/node-canvas/issues/1893#issuecomment-1096988007
        env = { LD_LIBRARY_PATH = lib.makeLibraryPath [ libuuid ]; };
        buildInputs = [
          ffmpeg-full
          nodejs_18
          nodePackages.pnpm
          awscli2
          zip
          libuuid
          imagemagick7_light
          pulumi
          pulumiPackages.pulumi-language-nodejs
          sqlite
          typst
          typstfmt
          typst-lsp
        ];
      };
    };
}
