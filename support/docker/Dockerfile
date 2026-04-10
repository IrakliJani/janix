FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive
ENV IS_SANDBOX=1
ENV USER=root
ENV PATH="/root/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/per-user/root/profile/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix \
    | sh -s -- install linux \
      --extra-conf "sandbox = false" \
      --extra-conf "experimental-features = nix-command flakes" \
      --extra-conf "accept-flake-config = true" \
      --init none \
      --no-confirm

ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) echo "x86_64-linux" ;; \
      arm64) echo "aarch64-linux" ;; \
      *) echo "Unsupported: $TARGETARCH" >&2 && exit 1 ;; \
    esac > /tmp/system

COPY janix-nix/ /tmp/janix-nix/
RUN nix build "/tmp/janix-nix#homeConfigurations.root-$(cat /tmp/system).activationPackage" -o /tmp/hm \
    && /tmp/hm/activate \
    && rm -rf /tmp/janix-nix /tmp/hm

COPY flake.nix flake.lock /flake/
RUN nix build "/flake#devShells.$(cat /tmp/system).default" --out-link /flake/dev-shell

WORKDIR /workspace
CMD ["sleep", "infinity"]
