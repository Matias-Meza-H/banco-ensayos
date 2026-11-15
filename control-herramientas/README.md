# Control de Herramientas · APAS Chile

App publicada como Artifact en claude.ai (estatus, listados con fichas, intercambiables, envío a calibración con confirmación, fabricador de Excel y Gantt de vencimientos).

## Regenerar con un Excel nuevo

```bash
python3 extract.py Inventario_de_Herramientas.xlsx data.json   # lee Her Cal, Her No Cal, Mant Prevent, Control Software, Location Control
python3 build.py .                                              # inyecta data.json y logo.txt en app.html -> control-herramientas.html
```

Los cambios hechos en la app (custodia, datos editados, intercambiables, historial) viven en la base de datos del artifact
(colecciones `edits`, `rel`, `log`) y se aplican encima de los datos del Excel, identificados por la clave `k`
(`C-<ID>` calibrables, `M-<n>` mantención preventiva, `N-<ACH>` no calibrables).
