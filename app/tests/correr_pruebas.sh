#!/usr/bin/env bash
# Corre TODA la verificación sobre una copia temporal (nunca toca app/data):
#   importación + reporte, maestro de herramientas, cálculos con el código JS real, documentos (QC-020, 03, 04),
#   ida y vuelta por "Exportar todo", lectura vía Claude Code y flujos clave con Playwright.
# Uso: tests/correr_pruebas.sh <Exportacion_...zip> [Inventario_de_Herramientas.xlsx]
set -euo pipefail
cd "$(dirname "$0")/.."
ZIP=$(realpath "$1"); XLSX=${2:+$(realpath "$2")}
T=$(mktemp -d); PORT=${APAS_TEST_PORT:-8799}; URL=http://127.0.0.1:$PORT
cleanup(){ [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null || true; rm -rf "$T"; }
trap cleanup EXIT
echo "== 1. Importación y reporte de verificación"; python3 import_export.py --datos "$T/datos" importar "$ZIP"
[ -n "${XLSX:-}" ] && { echo "== 2. Maestro de herramientas"; python3 import_export.py --datos "$T/datos" herramientas "$XLSX"; }
python3 -c "import zipfile,sys; open(sys.argv[2],'wb').write(zipfile.ZipFile(sys.argv[1]).read('datos_completos.json'))" "$ZIP" "$T/orig.json"
APAS_DATA="$T/datos" APAS_PORT=$PORT APAS_QUIET=1 python3 server.py > "$T/server.log" 2>&1 & PID=$!
for i in $(seq 40); do curl -s -o /dev/null "$URL/api/estado" && break; sleep 0.5; done
echo "== 3. Cálculos con el código de la plataforma"; node tests/verifica_calculos.js "$URL/" "$T/orig.json"
echo "== 4. Documentos QC-020 / 03 / 04"; node tests/documentos.js "$URL/" "${APAS_DOCS_OUT:-$T/documentos}"
echo "== 5. Ida y vuelta por Exportar todo"; node tests/ida_y_vuelta.js "$URL/" "$T/orig.json" "$T/ida_y_vuelta.zip"
echo "== 6. Lectura desde Claude Code (propuesta pendiente)"; node tools/lectura_claude_code.js --url "$URL" --proyecto P001 --lectura tests/lectura_prueba.json
echo "== 7. Flujos clave"; node tests/flujos.js "$URL"
echo; echo "TODO OK"
