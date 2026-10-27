
# Sistema-Gobernanza-IA

## Git LFS

`public/imports/ESTRUCTURAS_MT.csv` está versionado con Git LFS porque supera
el límite de 100 MB de un archivo Git normal. Instala Git LFS y ejecuta
`git lfs install` antes de clonar o trabajar con este repositorio. El uso de
almacenamiento y descargas LFS está sujeto a la cuota del propietario del repo.

## Desarrollo

Instala las dependencias de la interfaz y del servicio de predicción:

```powershell
npm install
python -m pip install -r requirements.txt
```

### PostgreSQL local

La aplicación guarda los datasets sectoriales, las cuentas/sesiones, eventos de
acceso y reportes generados en PostgreSQL. Copia `.env.example` a `.env` y
establece una contraseña propia para PostgreSQL y otra contraseña de al menos
12 caracteres para el supervisor inicial. Mantén `.env` fuera del control de
versiones.

En PowerShell:

```powershell
Copy-Item .env.example .env
# Edita .env y reemplaza los valores de ejemplo antes de continuar.
docker compose up -d
python -m pip install -r requirements.txt
npm install
npm run dev
```

`npm run dev` carga las variables de `.env`, inicia la API y sirve el frontend.
La API reintenta la conexión a PostgreSQL durante un máximo de 30 segundos al iniciar.
En el primer arranque, la API crea el esquema e importa los datasets sectoriales
y almacena todos los archivos de `public/imports` en PostgreSQL, incluidos los
CSV, libros Excel y PDF originales; debe haber al menos una cuenta inicial configurada con
`SEED_ADMIN_USERNAME` y `SEED_ADMIN_PASSWORD`. Los siguientes cambios de fuente
se sincronizan al iniciar la API mediante checksum. Los reportes se guardan en
`reportes_generados/files`; los datos de PostgreSQL persisten en el volumen
`postgres_data`. En el primer arranque, los archivos legados asociados a
`reportes_generados/metadata.json` se copian al nuevo almacenamiento y aparecen
en el historial PostgreSQL.

Para parar PostgreSQL sin borrar sus datos:

```powershell
docker compose down
```

Si prefieres iniciar la API y la interfaz por separado en dos terminales de
PowerShell, carga `.env` antes de arrancar la API:

```powershell
$env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', ''
python -m uvicorn api.main:app --reload --port 8000
```

En la segunda terminal, configura el puerto de proxy e inicia el frontend:

```powershell
$env:API_PORT = "8000"
npm run dev:web
```

La API `/api/forecasts` mantiene series XGBoost independientes para actividad
administrativa (denuncias SINADA, expedientes y resoluciones). Esas series no
son sustitutos de la demanda de hidrocarburos y no deben interpretarse como tal.
Son referencias experimentales con cobertura variable; no deben usarse para
decisiones operativas.

### Evaluación de demanda observada de combustibles

El modelo de demanda utiliza el libro `MNHL7-VentasCombustibles.xlsx`, con
`FCHA_DESPACHO` y `GALONES`, agregando las ventas observadas a nivel mensual.
Las ventas se consideran un indicador de demanda, no consumo final. La
preparación valida fechas y valores, elimina filas duplicadas exactas, conserva
los ceros observados y rechaza huecos mensuales en vez de imputarlos como cero.
El modelo crea rezagos y variables de calendario usando solo meses anteriores.
La evaluación separa cronológicamente los meses de prueba y compara XGBoost
con un baseline estacional de 12 meses sobre esas mismas observaciones.

Antes de entrenar, se revisan todos los archivos de `public/imports` y se
clasifican como objetivo, candidatos o excluidos con el motivo. Los precios de
`MNHL3-Estructura de precios combustibles.xlsx` y
`MNHL6-Precios combustibles.xlsx` se excluyen del modelo. Solo se evalúan las
series externas de EIA descritas abajo. Cada serie de precios se
alinea al mes siguiente para evitar usar información del propio mes pronosticado.
Una variable solo se incorpora si cuenta con al menos 24 meses de entrenamiento,
6 meses comparables de prueba, no tiene más de 2 meses de antigüedad y reduce el
MAE frente al XGBoost sin esa variable sobre las mismas fechas. Si ninguna fuente
cumple todos los criterios, se conserva el modelo basado en ventas. La pantalla
muestra cobertura, MAE comparativo y la razón de inclusión o exclusión por archivo.
La comparación de candidatos es exploratoria porque usa una sola ventana temporal;
no representa una validación independiente ni una mejora operativa garantizada.
Para horizontes futuros, si se selecciona una variable de precio, se mantiene
constante el último precio conocido y esa suposición se informa en el pronóstico.

La integracion opcional de EIA usa `EIA_API_KEY` desde `.env` y descarga por el
backend las series mensuales nacionales de precio minorista de gasolina regular
y diesel de EE. UU. Las series se mantienen como candidatas externas, se desplazan
un mes para evitar fuga temporal y solo se seleccionan si reducen el MAE temporal
frente al XGBoost sin esa serie. Son referencias del mercado estadounidense, no
precios peruanos. La respuesta se conserva en memoria durante seis horas; la clave
no se envia al navegador ni se registra en logs. La clave API gratuita se obtiene
en el portal oficial de EIA.

En **Dashboard Ejecutivo**, los roles Analista de Datos y Supervisor de
Cumplimiento pueden usar **Entrenar y evaluar**. El resultado incluye MAE,
RMSE, MAPE (o WAPE cuando hay reales iguales a cero), R², comparación MAE con
baseline, predicciones del periodo de prueba, SHAP, versión, fecha y cobertura.
Los modelos, métricas, predicciones trazables y tiempos de las operaciones del
modelo se guardan en PostgreSQL. La inicialización crea las tablas nuevas sin
eliminar tablas existentes.

Endpoints autenticados:

- `GET /api/demand-model/status`: estado, última evaluación y métricas.
- `POST /api/demand-model/train`: entrena, evalúa temporalmente y persiste el modelo (Analista de Datos o Supervisor).
- `POST /api/demand-model/evaluate`: ejecuta y persiste otra evaluación con la fuente actual (Analista de Datos o Supervisor).
- `POST /api/demand-model/predict` con `{"horizon_months": 1}`: predice de 1 a 12 meses con el último modelo, si la fuente no cambió desde el entrenamiento.
- `GET /api/demand-model/history`: historial de entrenamientos y predicciones.
- `GET /api/demand-model/governance-metrics`: métricas predictivas, trazabilidad y métricas de operación disponibles.

Los controles de gobernanza, tiempos de detección de riesgos, pruebas de
seguridad, detección de riesgos de IA y utilidad percibida permanecen como
pendientes/no disponibles hasta que existan registros verificables. La
comparación AS-IS/TO-BE no se declara validada sin datos AS-IS. SHAP solo se
reporta como disponible cuando la explicación se calcula correctamente.
Inspecciona los avisos de cobertura: los datos de ventas del repositorio llegan
a mayo de 2025 y no representan demanda actual en 2026. Instala las nuevas
dependencias del backend con `python -m pip install -r requirements.txt`. Las
pruebas enfocadas se ejecutan con:

```powershell
python -m unittest discover -s tests -v
```

El CSV CDCLyOPDH registra instalaciones y capacidad histórica, no existencias
actuales de inventario. Las ventas y los precios observados proceden de libros
Excel sectoriales; su cobertura temporal varía por serie. No hay datos de rutas
de transporte ni sensores ambientales para predecir transporte o clima. Los
registros IPASH son muestreos ambientales históricos y no se usan como alertas
en tiempo real. Al actualizar los archivos fuente, la API sincroniza los
cambios al iniciar.

El Resumen Ejecutivo también carga datos estructurados de 2026 desde los libros
de determinación de canon y de supervisiones/PAS. Solo presenta los meses con
registros válidos y muestra por separado la cobertura de cada fuente; los
valores no disponibles no se completan ni se extrapolan.
Los módulos de resumen, riesgos, trazabilidad y pronósticos utilizan las series
estructuradas de los CSV y libros Excel según el tema: determinación y
supervisión, producción/exportación/transporte y distribución de gas, ventas y
precios de combustibles, GLP, comercio exterior y multas. Cada indicador muestra
el periodo de su serie; no se combinan unidades ni se presentan los PDF anuales
y mensuales como observaciones adicionales cuando repiten las cifras de Excel.
La sección **Fuentes** presenta el catálogo autenticado de archivos originales,
con descarga y vista previa limitada para CSV y XLSX de hasta 20 MB. También
resume los registros de agentes, instalaciones y medios autorizados, los
muestreos IPASH por componente/año, los precios anonimizados del periodo más
reciente y los rangos del registro de precios minoristas. Estos registros
administrativos no se interpretan como existencias, envíos, rutas recorridas ni
mediciones de sensores; tampoco se generan alertas ambientales sin umbrales
configurados. Los originales se sirven desde la API autenticada, no como
archivos públicos del frontend.
Los módulos seleccionan automáticamente el último periodo disponible en cada
fuente; las coberturas pueden diferir y las secciones conceptuales o simuladas
se identifican como tales. El historial de reportes se muestra del más reciente
al más antiguo y su periodo se configura al generar cada reporte.
Los reportes incorporan las observaciones operativas del periodo seleccionado
para las tendencias, el transporte de gas, la distribución y las ventas; no
presentan datos de rutas, existencias o alertas que no estén en las fuentes.

En producción, configura un proxy inverso que dirija las rutas `/api/*` al
servicio Python; el proxy de Vite solo aplica durante el desarrollo.
  
