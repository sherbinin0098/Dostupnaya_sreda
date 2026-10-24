#!/bin/bash
# Проверка целостности собранного APK: подпись, версия, разрешения, плагины, веб-часть, отсутствие лишнего.
# Использование: tools/verify-apk.sh gorynych-dostupnost.apk www/index.html 1.48
set -u
APK="$1"; WEB="$2"; VER="$3"
BT=$(ls -d "$ANDROID_HOME"/build-tools/*/ 2>/dev/null | sort -V | tail -1)
fail=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=1; }
chk() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "Проверка $APK"
TMP=$(mktemp -d); unzip -q "$APK" -d "$TMP"

# версия и пакет
BADGE=$("$BT"aapt dump badging "$APK" 2>/dev/null | head -1)
chk "пакет ru.gorynych.dostupnost" "echo \"$BADGE\" | grep -q \"name='ru.gorynych.dostupnost'\""
chk "версия $VER" "echo \"$BADGE\" | grep -q \"versionName='$VER'\""

# разрешения
PERMS=$("$BT"aapt dump permissions "$APK" 2>/dev/null)
for p in CAMERA ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION RECORD_AUDIO INTERNET POST_NOTIFICATIONS; do
  chk "разрешение $p" "echo \"$PERMS\" | grep -q \"android.permission.$p\""
done

# плагины и классы в коде
DEX=$(cat "$TMP"/classes*.dex | strings)
for c in MainActivity DictationPlugin TiltPlugin; do chk "класс $c" "echo \"\$DEX\" | grep -q \"ru/gorynych/dostupnost/$c;\""; done
for m in listenQuiet micPermission no_permission gravity accelerometer; do chk "в коде есть «$m»" "echo \"\$DEX\" | grep -q \"$m\""; done
chk "Capacitor-плагины (файлы, поделиться, напоминания)" "grep -q Filesystem \"$TMP/assets/capacitor.plugins.json\" && grep -q 'Share' \"$TMP/assets/capacitor.plugins.json\" && grep -q LocalNotifications \"$TMP/assets/capacitor.plugins.json\""

# веб-часть
chk "веб-часть в APK совпадает с собранной" "cmp -s \"$TMP/assets/public/index.html\" \"$WEB\""
chk "номер версии виден на странице" "grep -q \"Версия $VER\" \"$TMP/assets/public/index.html\""
chk "карта (Leaflet) на месте" "test -s \"$TMP/assets/public/leaflet/leaflet.js\" && test -s \"$TMP/assets/public/leaflet/leaflet.css\""
chk "нет лишнего (карты исходников Leaflet)" "! find \"$TMP/assets\" -name '*.map' | grep -q ."
chk "в коде нет отладочных обёрток страницы (testing)" "! grep -q 'VITE_EXPOSE' \"$TMP/assets/public/index.html\""

# подпись
if [ -x "$BT"apksigner ]; then
  chk "подпись APK корректна" "\"$BT\"apksigner verify \"$APK\" >/dev/null 2>&1"
fi

echo "Размер APK: $(stat -c%s "$APK") байт"
rm -rf "$TMP"
if [ $fail -ne 0 ]; then echo "ЦЕЛОСТНОСТЬ НАРУШЕНА"; exit 1; fi
echo "Целостность подтверждена"
