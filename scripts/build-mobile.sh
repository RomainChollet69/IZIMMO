#!/bin/bash
# build-mobile.sh
# Copie les fichiers web dans www/ pour le build Capacitor.
# Ne modifie aucun fichier source — www/ est un miroir de build.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WWW_DIR="$PROJECT_ROOT/www"

echo "🏗️  Build mobile Léon — copie vers www/"

# Nettoyage
rm -rf "$WWW_DIR"
mkdir -p "$WWW_DIR"

# Copier les fichiers/dossiers web pertinents
# HTML à la racine
cp "$PROJECT_ROOT"/*.html "$WWW_DIR/" 2>/dev/null || true

# JS, CSS, images, libs
for dir in js css img lib; do
  if [ -d "$PROJECT_ROOT/$dir" ]; then
    cp -r "$PROJECT_ROOT/$dir" "$WWW_DIR/$dir"
  fi
done

# Copier favicon et assets racine
cp "$PROJECT_ROOT"/*.ico "$WWW_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT"/*.png "$WWW_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT"/*.svg "$WWW_DIR/" 2>/dev/null || true
cp "$PROJECT_ROOT"/*.webp "$WWW_DIR/" 2>/dev/null || true

# Injecter le bridge natif dans chaque fichier HTML
# Ajoute native-bridge.js avant </head> si pas déjà présent
for html_file in "$WWW_DIR"/*.html; do
  if [ -f "$html_file" ] && ! grep -q 'native-bridge.js' "$html_file"; then
    sed -i 's|</head>|<script src="/js/native-bridge.js"></script>\n</head>|' "$html_file"
  fi
done

# Créer index.html (point d'entrée Capacitor → redirige vers login)
if [ ! -f "$WWW_DIR/index.html" ]; then
  cat > "$WWW_DIR/index.html" << 'INDEXEOF'
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Léon</title>
  <script src="/js/native-bridge.js"></script>
  <script>window.location.href = '/login.html';</script>
</head>
<body></body>
</html>
INDEXEOF
fi

HTML_COUNT=$(find "$WWW_DIR" -maxdepth 1 -name '*.html' | wc -l)
echo "✅ Build terminé — ${HTML_COUNT} pages HTML copiées dans www/"
