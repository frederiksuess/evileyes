#!/bin/bash
# Richtet einen Linux-Mint-Rechner als „Portal“ ein:
#  - Browser startet nach dem Anmelden im Vollbild (Kiosk) mit der Feueraugen-Seite
#  - Bildschirmschoner, Abdunkeln und Energiesparen werden abgeschaltet
#
# Aufruf:  bash tools/linux-kiosk.sh https://<name>.github.io/<repo>/
# Rückgängig: ~/.config/autostart/feueraugen-portal.desktop löschen
set -e
URL="${1:?Bitte die Adresse der App angeben, z. B. https://name.github.io/feueraugen/}"
case "$URL" in *\?*) URL="$URL&auto" ;; *) URL="$URL?auto" ;; esac

# Browser finden (Chromium-basierte bevorzugt: Kamera-Rechte und Kiosk funktionieren dort am besten)
BROWSER=""
for b in google-chrome google-chrome-stable chromium chromium-browser; do
  command -v "$b" >/dev/null && { BROWSER="$b"; break; }
done
if [ -z "$BROWSER" ] && command -v flatpak >/dev/null && flatpak info org.chromium.Chromium >/dev/null 2>&1; then
  BROWSER="flatpak run org.chromium.Chromium"
fi

if [ -n "$BROWSER" ]; then
  START="$BROWSER --kiosk --noerrdialogs --disable-session-crashed-bubble --disable-infobars \
--autoplay-policy=no-user-gesture-required --check-for-update-interval=31536000 \"$URL\""
else
  echo "Kein Chrome/Chromium gefunden – nehme Firefox. (Empfohlen: sudo apt install chromium)"
  START="firefox --kiosk \"$URL\""
fi

mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/feueraugen-portal.desktop" << DESK
[Desktop Entry]
Type=Application
Name=Feueraugen-Portal
Comment=Startet das Portal im Vollbild
Exec=sh -c 'sleep 8; $START'
X-GNOME-Autostart-enabled=true
DESK

# Nicht einschlafen, nicht abdunkeln (Cinnamon / MATE / Xfce – was vorhanden ist)
gsettings set org.cinnamon.desktop.session idle-delay 0 2>/dev/null || true
gsettings set org.cinnamon.desktop.screensaver lock-enabled false 2>/dev/null || true
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-display-ac 0 2>/dev/null || true
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-inactive-ac-timeout 0 2>/dev/null || true
gsettings set org.mate.screensaver idle-activation-enabled false 2>/dev/null || true
xfconf-query -c xfce4-power-manager -p /xfce4-power-manager/dpms-enabled -s false 2>/dev/null || true

echo
echo "Fertig. Beim nächsten Anmelden startet das Portal automatisch:"
echo "  $URL"
echo
echo "Wichtig, einmalig: Die Seite jetzt normal im Browser öffnen, die Kamera erlauben"
echo "und „Erlaubnis merken“ wählen – sonst fragt der Browser nach jedem Start."
echo "Beenden des Kiosk-Modus: Alt+F4."
