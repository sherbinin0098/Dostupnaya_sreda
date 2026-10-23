#!/usr/bin/env bash
# Пересобрать картинки иконки в android-res/ из icon.png (квадрат 1024×1024, синий фон без углов).
# Нужен ImageMagick. Запуск из корня репозитория: bash tools/make-icons.sh
set -e
IM=$(command -v magick || command -v convert)
RES=android-res
BG="#01318A"
TMP=$(mktemp -d)
# символ без фона (фон убирается по цвету)
"$IM" icon.png -fuzz 18% -transparent "rgb(1,49,136)" -fuzz 18% -transparent "rgb(12,49,136)" "$TMP/fg.png"
for pair in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read d px fgpx <<< "$pair"
  mkdir -p "$RES/mipmap-$d"
  # старые Android: готовая картинка целиком
  "$IM" icon.png -resize ${px}x${px} "$RES/mipmap-$d/ic_launcher.png"
  cp "$RES/mipmap-$d/ic_launcher.png" "$RES/mipmap-$d/ic_launcher_round.png"
  # Android 8+: символ на 86% холста 108dp, чтобы влезал в безопасную зону маски
  inner=$(( fgpx * 86 / 100 ))
  "$IM" "$TMP/fg.png" -resize ${inner}x${inner} -background none -gravity center -extent ${fgpx}x${fgpx} "$RES/mipmap-$d/ic_launcher_foreground.png"
done
mkdir -p "$RES/values"
cat > "$RES/values/ic_launcher_background.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$BG</color>
</resources>
XML
rm -rf "$TMP"
echo "Готово: $RES"
