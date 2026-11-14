#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# MIGRACIÓN — Drama AI Studio de Vercel a Google Cloud Run.
#
# Se ejecuta UNA vez, en Cloud Shell, dentro del clon del repo, con la
# cuenta alixoncbp1 (proyecto drama-ai-studio-513501). Hace tres cosas:
#   1. Trae las variables del proyecto de Vercel (los valores nunca se
#      imprimen en pantalla: viajan del archivo de Vercel al despliegue).
#   2. Despliega el servicio «drama-ai-studio» en Cloud Run con esas
#      mismas variables: misma cuenta de servicio, mismo bucket, mismos
#      proyectos e imágenes. El depósito no se toca ni se copia.
#   3. Borra los archivos temporales con valores y deja Vercel intacto
#      como respaldo (no se borra ni se cambia nada en Vercel).
#
# Después, a mano en la consola de Firebase del proyecto del estudio:
# añadir el dominio nuevo (…-uc.a.run.app) a «Authentication →
# Settings → Authorized domains», o el inicio de sesión no funcionará
# en la dirección nueva.
# ════════════════════════════════════════════════════════════════
set -euo pipefail
PROYECTO=drama-ai-studio-513501
REGION=us-central1
SERVICIO=drama-ai-studio

cd "$(dirname "$0")"
gcloud config set project "$PROYECTO" >/dev/null

echo "── 1/3 · Variables desde Vercel ──"
npx --yes vercel@latest link --yes --project drama-ai-studio
npx --yes vercel@latest env pull .env.migracion --environment=production
python3 - <<'PY'
import json
variables = {}
for linea in open('.env.migracion', encoding='utf-8'):
    linea = linea.strip()
    if not linea or linea.startswith('#') or '=' not in linea:
        continue
    nombre, valor = linea.split('=', 1)
    nombre = nombre.strip()
    # Fuera las variables del sistema de Vercel: en Cloud Run no pintan nada.
    if nombre.startswith('VERCEL_') or nombre.startswith('NEXT_'):
        continue
    valor = valor.strip()
    if len(valor) >= 2 and valor[0] == '"' and valor[-1] == '"':
        try:
            valor = json.loads(valor)
        except Exception:
            valor = valor[1:-1]
    variables[nombre] = valor
with open('env-nube.yaml', 'w', encoding='utf-8') as f:
    for nombre, valor in variables.items():
        f.write(f"{nombre}: {json.dumps(valor, ensure_ascii=False)}\n")
print('Variables trasladadas (solo nombres):', ', '.join(sorted(variables)))
PY

echo "── 2/3 · Despliegue en Cloud Run ──"
gcloud run deploy "$SERVICIO" \
  --source=. \
  --region="$REGION" \
  --project="$PROYECTO" \
  --allow-unauthenticated \
  --timeout=3600 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --env-vars-file=env-nube.yaml

echo "── 3/3 · Limpieza y dirección nueva ──"
rm -f .env.migracion env-nube.yaml
echo "Dirección del estudio en Cloud Run:"
gcloud run services describe "$SERVICIO" --region="$REGION" --project="$PROYECTO" --format='value(status.url)'
