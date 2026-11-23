# Plataforma de Calidad · APAS Chile — versión local 02.00.00

Aplicación web local que reúne, con una sola base de datos:

- **Plataforma de Calidad**: Capacidades (inicio, cartera, aeronaves, autoridades), Expedientes, Carga de evidencias, Informes y documentos FAA/DGAC, Personal y capacitación, y Sistema (circulares, registro, respaldo, exportación, auditoría y versiones).
- **Control de Herramientas** (`/herramientas/`): maestro de herramientas calibrables y no calibrables, custodia, intercambiables, fabricador de Excel y Gantt de vencimientos.

No tiene cuentas ni contraseñas. Quien opera escribe su nombre arriba a la derecha (**Cambiar nombre**) y ese nombre queda en cada línea del registro de modificaciones.

## Puesta en marcha

Requisitos: Python 3.10 o superior. Las dependencias opcionales están en `requirements.txt`.

```bash
cd app
# 1) Importar la exportación de la plataforma (verifica CRC32, conteos, referencias, textos DGAC y cálculos)
python3 import_export.py importar /ruta/Exportacion_Plataforma_Calidad_APAS_2026-11-23_v01.03.02.zip
# 2) Importar el maestro de herramientas (requiere openpyxl)
python3 import_export.py herramientas /ruta/Inventario_de_Herramientas.xlsx
# 3) Iniciar el servidor
python3 server.py            # abre http://127.0.0.1:8765/
```

Los datos quedan en `app/data/`:

- `plataforma.db`: SQLite.
- `storage/<assetId>`: los archivos.

Esa carpeta **no se sube al repositorio** (`.gitignore`), porque contiene datos personales (RUT, licencias) y las evidencias.

Variables de entorno:

| Variable | Uso | Valor por defecto |
|---|---|---|
| `APAS_PORT` | Puerto del servidor | `8765` |
| `APAS_DATA` | Carpeta de datos | `app/data` |
| `APAS_ACTOR` | Nombre de quien opera | `local` |
| `APAS_CLAUDE=0` | Desactiva la lectura con Claude | — |
| `APAS_CLAUDE_MODEL` | Modelo para la lectura | `claude-opus-5-5` |
| `APAS_REBUILD=1` | Rearma la página al iniciar | — |
| `ANTHROPIC_API_KEY` | Clave para la lectura con Claude (ver más abajo) | — |

## Arquitectura y por qué

| Pieza | Archivo | Decisión |
|---|---|---|
| Base de datos | `store.py` | **SQLite, una tabla por colección** (`proj`, `evid`, `rev`, `lect`, `train`, `art`, `snap`, `cfg`, `circ`, `log`, `certs`, `pers`, `bak`, `herr_*`). Cada documento se guarda como JSON tal cual, con el orden de claves y el orden de la colección. Así la ida y vuelta es exacta byte a byte. Las listas de solo lectura (catálogo FAA/DGAC, personal base, semillas, maestro de herramientas) van una fila por elemento. |
| Servidor | `server.py` | Solo biblioteca estándar de Python, sin instalar nada. Escucha solo en `127.0.0.1`. Toda escritura exige la cabecera `X-APAS`, que protege de escrituras desde otras páginas. `/_blob/<assetId>` sirve los archivos desde `data/storage`. |
| Interfaz | `web/src/*` | Es **el código de la plataforma 01.03.02**, que era la especificación funcional y visual, con cambios mínimos y revisables con `git diff`. La plataforma llamaba `window.claude.use('db' / 'assets' / 'downloads' / 'user' / 'sample')`. `web/claude-local.js` entrega esa misma interfaz contra el servidor local. Así las reglas exactas (semáforo, avance, armado de PDF, `buildOps`, respaldo, exportación) **corren sin reescribirse**, y la verificación lo demuestra con el código real. |
| Armado | `web/build.py` | Ensambla `web/dist/index.template.html` igual que el `build.py` original. Los datos no se incrustan: el servidor los inyecta desde la base en cada carga. |
| Cálculos en Python | `calc.py` | Port de `progress`, `stage`, `sema`, `upgrade` y de la combinación del personal. Se usa para exportar desde la terminal y como **segunda verificación independiente** del código JS. |
| Importación y exportación | `import_export.py` | Importa (idempotente), verifica y exporta en el mismo formato `.zip` de *Sistema › Exportar todo*. |
| Herramientas | `herramientas.py`, `web/herramientas/` | El módulo Control de Herramientas, con la misma base. Su página guarda en `herr_edits`, `herr_rel` y `herr_log`. |
| Lectura con Claude | `claude_bridge.py`, `tools/lectura_claude_code.js` | Opción a (API) y opción b (Claude Code). Detalle más abajo. |

Cambios hechos al código de referencia (`git diff 0930df5 -- app/web/src`):

- Versión **02.00.00**.
- Sin pantalla de ingreso; queda un operador local. El usuario inicial y su credencial se retiraron del código.
- El historial de versiones, las 7 autoridades y las 30 preguntas QC-021 se leen de la base, no del código.
- Pestaña **Accesos y permisos** documentada.
- Auditoría adaptada a la versión local.
- Línea de marca bajo el logo en el QC-020 y en el 03.
- Vínculo por P/N con herramientas.
- Enlace a Control de Herramientas.

### Herramientas de los expedientes ↔ maestro de herramientas

Cada ítem de *Herramientas y equipos* (o *Herramientas por tarea*) se cruza por **P/N normalizado** (`pn` y cada `pnAlt`) con el maestro.

- **En el expediente**, el ítem muestra: 🔧 cuántas unidades hay, cuántas están **disponibles en APAS** (servible, en APAS, con calibración vigente y no perdida, scrap ni rota), cuántas están en calibración, y los intercambiables. Trae un enlace al maestro.
- **En la ficha de la herramienta** aparece "Expedientes de capacidad que usan este P/N".
- El cruce se calcula en el momento (`/api/herramientas/indice`), así que cualquier cambio de custodia se ve de inmediato.

## Verificación (resultado con la exportación del 2026-11-23)

```bash
tests/correr_pruebas.sh /ruta/Exportacion_...zip /ruta/Inventario_de_Herramientas.xlsx
```

Trabaja en una copia temporal y nunca toca `app/data`. Hace:

1. **Importación**: JSON 1.998.361 bytes con CRC32 `b5d13f5f` igual al manifiesto. 18 de 18 archivos con bytes y CRC32 iguales y 0 sin destino. Los 19 conteos son iguales a `manifiesto.conteos`.
2. **Integridad referencial**: las 18 evidencias tienen proyecto, los `itemId` existen y los 18 `assetId` tienen archivo. Las 62 operaciones de la lectura pendiente de P001 apuntan a ítems existentes. Hay un ⚠: la revisión `x8m26001sbms5akx0a3o` no tiene evidencia, porque la evidencia se eliminó en la plataforma el 13-11-2026 según el registro. Se conserva tal cual.
3. **Cálculos**: los 43 proyectos dan avance, etapa y semáforo iguales a `_calc`, tanto con el código JS real (en el navegador, con la fecha fijada en la de la exportación) como con el port Python. La vista del personal (142 personas) es idéntica una a una.
4. **Textos DGAC**: los 39 `verb` son idénticos byte a byte.
5. **Documentos**: QC-020, 03 y 04 del ELT (P003) y del Thrust Reverser (P001).
   - El 04 del ELT tiene **51 páginas (CMM 25-63-05)** y **50 (CMM 25-63-08)**.
   - La autoevaluación firmada (`autoeval`, sin capítulo) no entra al 04.
6. **Ida y vuelta**:
   - Por terminal (importar → exportar → importar): el JSON regenerado es **byte a byte idéntico** si se reponen `_meta` y `_calc`.
   - Por el botón de la app: todo lo original queda intacto. Solo se suma lo que la versión local agrega por diseño: la línea 02.00.00 en *versiones*, las líneas nuevas del *registro* y la foto semanal del avance.
7. **Flujos con Playwright** (13 de 13): crear proyecto por tipo, subir y aprobar evidencia, lectura → confirmar, roster con previsualización → Excel, circular con correlativo (el número anulado no se reutiliza), respaldo, exportar y registro con actor.

Reimportar la misma exportación con `--reemplazar` deja los datos idénticos (antes copia la base). Solo cambian la fecha de importación y los contadores internos de cambios.

## Lectura con Claude

**Opción a: API de Anthropic, desde la misma página.**

1. Instala el SDK con `pip install anthropic`.
2. Define la clave en el entorno (`export ANTHROPIC_API_KEY=...`) o usa `ant auth login`. Nunca va en el código.

Al iniciar, el servidor indica si la lectura está disponible. Usa `claude-opus-5-5` (cambiable con `APAS_CLAUDE_MODEL`). El *modelTier* de la plataforma se traduce en esfuerzo: rápido = bajo, normal = medio, complejo = alto.

Tiene activado el respaldo automático del servidor de Anthropic (`fallbacks: "default"`): si el modelo declina un documento, la API reintenta con otro modelo dentro de la misma llamada. Se puede quitar en `claude_bridge.py`.

Se usa para:

- *Carga y lectura de documentos*.
- *Verificar sticker*.
- *Leer la autoevaluación firmada*.

Sin clave, la app funciona igual: el documento se sube como evidencia y se lee después.

**Opción b: Claude Code desde la terminal.** Le pasas el documento a Claude Code y Claude Code:

1. Lo lee y escribe lo leído en un JSON con la misma forma que pide la plataforma (`LECT_PROMPT` en `web/src/lect.js`), copiando P/N, revisiones y fechas tal cual.
2. Ejecuta `node tools/lectura_claude_code.js --proyecto P001 --archivo doc.pdf --lectura leido.json`. El script:
   - sube el documento como evidencia con el sello **🤖 Cargado vía Claude** (`via:'claude'`, actor `claude (Code)`);
   - arma las propuestas con el **mismo** `buildOps` de la plataforma;
   - las deja **pendientes**.
3. Tú revisas en *Expedientes › Carga y lectura de documentos* y eliges qué aplicar. Lo que tiene inconsistencias viene desmarcado y con ⚠.

## Permisos (modelo documentado, sin implementar)

Esta versión no tiene cuentas. Si se agregan, los permisos son **por usuario, nunca por cargo**: a cada persona se le marcan solo sus permisos. Los perfiles son solo puntos de partida.

| Permiso | Habilita |
|---|---|
| `cap` | Ver Capacidades |
| `pers` | Ver Personal y capacitación |
| `cap.edit` | Editar expedientes y aprobar evidencias |
| `cap.upload` | Subir evidencias de capacidades |
| `faa` | Aprobación FAA interna (alto cargo) |
| `pers.edit` | Editar fichas del personal |
| `pers.upload` | Adjuntar certificados del personal |
| `pers.bases` | Editar bases de personal |
| `circ` | Emitir y anular circulares |
| `users` | Administrar usuarios |
| `bak` | Respaldo, restauración y auditoría |

Perfiles de partida: Administrador (todos), Gerencia (`cap`, `pers`, `faa`, `circ`), Colaborador limitado (`cap`, `pers`, `cap.upload`, `pers.upload`), Visor (`cap`, `pers`) e Invitado de 8 horas.

El código de la gestión de cuentas de la 01.03.02 sigue en `web/src/sys.js` (pestaña `usuarios_original`, desactivada) como base para cuando se implemente.

## Respaldo

- **Automático** cada 1 o 3 días, configurable en *Sistema › Respaldo*.
- **Dos generaciones** (A = último, B = anterior), guardadas en la propia base.
- Cada generación se puede **descargar**.
- La interfaz no tiene función para borrarlos.

Además, *Exportar todo* (o `python3 import_export.py exportar`) genera el `.zip` completo, con el mismo formato y el manifiesto con CRC32. Copiar la carpeta `app/data` también es un respaldo completo.

## Versiones

Formato `DISEÑO.ACCESOS.DATOS`:

- 1.º número: diseño y versión web.
- 2.º número: accesos, mejoras internas y evidencias.
- 3.º número: bancos de datos.

Al subir un número, los de su derecha vuelven a 00. Cada cambio publicado agrega una línea al historial (*Sistema › Versión*, tabla `versiones`). Para publicar una versión nueva, cambia `APP_VER` y `VERSION_LINE` en `server.py` y `APP_VER` en `web/src/sys.js`. El servidor agrega la línea al historial una sola vez y lo deja en el registro.

## Pendientes y límites conocidos

- **Compresión de archivos (regla 4)**: la aplican las subidas desde la página: fotos a 1.800 px con calidad 0,72, PDF escaneados a 1.100 px con calidad 0,5, y se conserva el original si no ahorra al menos 10%. Las subidas por terminal (`tools/lectura_claude_code.js`) guardan el original.
- **Borrar archivos**: cuando la página "borra" un adjunto, la versión local conserva el archivo en `data/storage`. Nada se pierde.
- **Línea de marca en los documentos**: el QC-020 y el 03 llevan el logo y "DGAC CMA #655 · FAA CRS #APAY048E" a la derecha del encabezado. Los informes internos ya la tenían. No modifiqué la portada del 04 ni la plantilla "Special Tools Evidence", que tienen el logo y siguen el formato de la presentación del ELT aceptada por la FAA. Si quieres la línea también ahí, es un cambio de 2 líneas.
- **Circulares**: el correlativo, la anulación y el adjunto funcionan. El punto de conexión para el formato oficial `.docx` es el botón *Emitir y registrar* (`#ciS` en `web/src/sys.js`). Ahí se genera el documento cuando se entregue la plantilla.
- **Pendientes de definición del negocio**: el proceso de autoridades nuevas y la sección OJT del informe personal siguen "por definir", igual que en la 01.03.02.

## Observaciones en los datos (no corregidas: requieren tu decisión)

- **P001, CMM 78-30-02**: el expediente dice Rev. 33; el QC-020 y la QC-021 dicen Rev. 30. Las fechas son Dec 25, 2025 en el QC-020 y DEC/24/2025 en la QC-021.
- **P001, QC-021**: dice fabricante "PRATT & WHITNEY" y "(LW & RW)"; el QC-020 dice UTC Aerospace Systems y "(LH & RH)".
- **P001, herramientas**: el QC-020 declara 4 disponibles que el expediente tiene en cotización o compra. El MO-100 probablemente es calibrable.
  - **Nuevo, por el cruce con el maestro**: el *Thrust Reverser Actuator Primary Lock Pin* P/N 636-3000-28GSE figura "en Cotización" en el expediente, pero el maestro de herramientas tiene 1 unidad (ACH2446, PIN, ubicación HTADF-01).
- **P003, 03 original**: la fecha del QC Manager es 25/08/2025 en vez de 25/08/2026, y IV e) parte en "2.-".
- **P022**: tiene fecha de aprobación pero la aprobación sin marcar (heredado del Excel).
- **Revisión huérfana** `x8m26001sbms5akx0a3o`: rechazada el 13-11-2026 ("no aplica a 1 sola unidad"); su evidencia se eliminó después.
- **La lectura del QC-020 de P001** (`Lchat-P001-qc020`, 62 propuestas, 5 con aviso) sigue **pendiente** y se puede confirmar en la app.
