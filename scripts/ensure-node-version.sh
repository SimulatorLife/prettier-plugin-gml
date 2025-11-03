#!/usr/bin/env bash
# Ensures the Node.js version matches the one specified in .nvmrc.

ensure_node_version() {
  local script_dir root_dir nvmrc_path required_node_version normalized_required
  local current_before current_after nvm_dir_default nvm_dir nvm_loaded sourced

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root_dir="$(cd "${script_dir}/.." && pwd)"
  nvmrc_path="${root_dir}/.nvmrc"

  if [ ! -f "$nvmrc_path" ]; then
    return 0
  fi

  required_node_version="$(tr -d '\r\n' < "$nvmrc_path")"

  if [ -z "$required_node_version" ]; then
    echo "[ensure-node-version] .nvmrc is empty; skipping Node version enforcement." >&2
    return 0
  fi

  normalized_required="$required_node_version"
  if [[ "$normalized_required" != v* ]]; then
    normalized_required="v$normalized_required"
  fi

  current_before="$(node -v 2>/dev/null || echo "")"

  nvm_dir_default="$HOME/.nvm"
  nvm_dir="${NVM_DIR:-$nvm_dir_default}"
  nvm_loaded=0

  if [ -s "$nvm_dir/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$nvm_dir/nvm.sh"
    nvm_loaded=1
    nvm install "$required_node_version" >/dev/null
    nvm use "$required_node_version" >/dev/null
  fi

  current_after="$(node -v 2>/dev/null || echo "")"

  if [ "$current_after" != "$normalized_required" ]; then
    echo "[ensure-node-version] Current node version: ${current_after:-none}. Required: $normalized_required." >&2
    if [ "$nvm_loaded" -eq 0 ]; then
      echo "[ensure-node-version] Unable to locate nvm (expected $nvm_dir/nvm.sh)." >&2
    fi
    echo "[ensure-node-version] Run 'nvm install $required_node_version' and 'nvm use $required_node_version' before continuing." >&2
    return 1
  fi

  sourced=0
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    sourced=1
  fi

  if [ "$sourced" -eq 0 ] && [ "$current_before" != "$normalized_required" ]; then
    echo "[ensure-node-version] Detected Node ${current_before:-none}; required $normalized_required. Restart this command after running 'nvm use $required_node_version'." >&2
    return 1
  fi

  if [ "$sourced" -eq 1 ] && [ "$current_before" != "$normalized_required" ]; then
    echo "[ensure-node-version] Switched Node from ${current_before:-none} to $normalized_required using nvm." >&2
  fi

  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  ensure_node_version "$@"
fi
