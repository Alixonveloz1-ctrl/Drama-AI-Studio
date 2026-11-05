#!/usr/bin/env bash
# Montador de Drama AI Studio. Variables que pone el estudio al lanzarlo:
#   TRABAJO  gs://…/montaje/<modo>-epNN   (descargas.txt, montar.sh)
#   SALIDA   gs://…/medios/<archivo>      (dónde queda el resultado)
#   ARCHIVO  nombre del archivo que produce montar.sh
set -Eeuo pipefail
: "${TRABAJO:?Falta TRABAJO}"
: "${SALIDA:?Falta SALIDA}"
: "${ARCHIVO:?Falta ARCHIVO}"

TRABAJO_LOCAL=/trabajo
rm -rf "$TRABAJO_LOCAL" && mkdir -p "$TRABAJO_LOCAL" && cd "$TRABAJO_LOCAL"

# Si algo falla, el motivo (las últimas líneas del registro) queda en
# error.txt: es lo único que el dueño puede leer desde el teléfono.
informar_error() {
  local codigo=$?
  { echo "El montaje se detuvo (código $codigo). Últimas líneas:"; tail -n 25 registro.txt 2>/dev/null || true; } > /tmp/error.txt
  gcloud storage cp /tmp/error.txt "$TRABAJO/error.txt" >/dev/null 2>&1 || true
  exit "$codigo"
}
trap informar_error ERR

echo "Descargando el material…" | tee registro.txt
gcloud storage cp "$TRABAJO/descargas.txt" ./descargas.txt >>registro.txt 2>&1
gcloud storage cp "$TRABAJO/montar.sh" ./montar.sh >>registro.txt 2>&1
chmod +x montar.sh
while IFS=$'\t' read -r origen destino; do
  [[ -z "${origen:-}" || -z "${destino:-}" ]] && continue
  mkdir -p "$(dirname "$destino")"
  gcloud storage cp "$origen" "$destino" >>registro.txt 2>&1
done < descargas.txt

echo "Montando…" | tee -a registro.txt
./montar.sh >>registro.txt 2>&1

[[ -s "$ARCHIVO" ]] || { echo "El guion terminó pero no produjo $ARCHIVO" >>registro.txt; false; }
gcloud storage cp "$ARCHIVO" "$SALIDA" >>registro.txt 2>&1
: > /tmp/error.txt
gcloud storage cp /tmp/error.txt "$TRABAJO/error.txt" >/dev/null 2>&1 || true
echo "Listo: $SALIDA"
