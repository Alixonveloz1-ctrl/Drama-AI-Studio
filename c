#!/usr/bin/env bash
# Drama AI Studio · entrada única desde Cloud Shell.
# Cloud Shell no deja pegar texto desde el iPhone, así que solo se teclea:
#   git pull
#   ./c
# y el instalador del repositorio hace el resto.
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Falta Python 3 en este entorno. Abre Cloud Shell desde el enlace de la conversación."
  exit 1
fi
if ! command -v gcloud >/dev/null 2>&1; then
  echo "Falta gcloud en este entorno. Abre Cloud Shell desde el enlace de la conversación."
  exit 1
fi
exec python3 "$RAIZ/instalador/instalar.py" "$@"
