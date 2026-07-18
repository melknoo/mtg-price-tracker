#!/usr/bin/env bash
# Installs the systemd user units for the MTG price tracker.
# Idempotent: safe to re-run after editing unit files.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"

mkdir -p "$UNIT_DIR"
for unit in mtg-tracker.service mtg-tracker.timer mtg-web-ui.service; do
  ln -sf "$DEPLOY_DIR/$unit" "$UNIT_DIR/$unit"
done

systemctl --user daemon-reload
systemctl --user enable --now mtg-tracker.timer mtg-web-ui.service

echo
systemctl --user list-timers mtg-tracker.timer --no-pager
systemctl --user status mtg-web-ui.service --no-pager || true

if [ "$(loginctl show-user "$USER" -p Linger --value)" != "yes" ]; then
  echo
  echo "HINWEIS: Lingering ist deaktiviert — Units laufen nur bei aktiver Login-Session."
  echo "Einmalig ausfuehren: sudo loginctl enable-linger $USER"
fi
