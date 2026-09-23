# De reglas simples a analítica avanzada — plan de evolución

## Qué tienes ahora (ya funcionando, sin el banner de beta)

Un módulo de **analítica descriptiva basada en reglas**: calcula
estadísticas reales (promedios, tendencias, porcentajes de adherencia)
directamente sobre las tablas operativas (`vitals_readings`,
`medication_intake_log`, `fall_events`) y aplica umbrales clínicos
transparentes para marcar cada indicador como "normal" o "atención". Es
honesto llamarlo así — **no es machine learning ni un modelo predictivo**,
es aritmética y comparación de rangos, pero es real, se puede auditar
línea por línea, y ya aporta valor de decisión hoy mismo.

Esto es, de hecho, una base perfectamente razonable — muchos sistemas de
salud digital en producción funcionan así durante años antes de justificar
la inversión en algo más sofisticado.

## Por qué esto NO es lo mismo que un modelo copo de nieve

Ahora mismo, cada consulta de análisis (`GET /analytics/summary`) hace
varios `SELECT` con agregaciones **directamente sobre las tablas
operativas** — las mismas que usa la app para el día a día. Esto funciona
bien con pocos pacientes y poco historial, pero tiene límites reales:

- Cada vez que alguien abre la pantalla de análisis, se recalculan
  promedios desde cero sobre toda la tabla — con miles de pacientes y
  meses de historial, esas consultas se vuelven lentas.
- Las tablas operativas están diseñadas para *escribir* rápido (registrar
  una toma de medicina, una lectura del sensor), no para *analizar*
  rápido cruces de muchas variables a la vez.
- Mezclar la carga de "la app funcionando en vivo" con "generar reportes
  analíticos pesados" en la misma base de datos puede hacer que ambas
  cosas se vuelvan más lentas conforme crece el proyecto.

## Qué es un modelo copo de nieve, en términos simples

Es una segunda base de datos (o un conjunto de tablas separadas dentro de
la misma), diseñada **exclusivamente para analizar**, no para operar. En
vez de tablas normalizadas como las que ya tienes (`patients`,
`medications`, `vitals_readings`...), se organiza así:

- **Una tabla de hechos** (`fact_vitals_reading`, por ejemplo): una fila
  por cada medición, con las métricas numéricas (frecuencia cardiaca,
  SpO2, etc.) y claves hacia las tablas de dimensión.
- **Tablas de dimensión**, cada una descomponiendo un aspecto del
  contexto: `dim_patient` (datos del paciente), `dim_time` (año, mes,
  día, hora, día de la semana — para poder agrupar "todos los lunes" o
  "por mes" sin recalcular fechas cada vez), `dim_medication`,
  `dim_condition` (ej. EPOC, diabetes), etc. Estas dimensiones a su vez
  pueden dividirse en sub-tablas más normalizadas — de ahí el nombre
  "copo de nieve" (a diferencia de un esquema "estrella", donde las
  dimensiones no se subdividen más).

**Ejemplo concreto con tus datos:** en vez de calcular "promedio de SpO2
de los últimos 7 días" con un `WHERE recorded_at >= ...` cada vez que
alguien abre la app, tendrías una tabla `fact_vitals_reading` ya separada
por día/paciente/condición, sobre la que los promedios y comparaciones
son muchísimo más rápidos de consultar, incluso con años de historial y
miles de pacientes.

## Cómo migrar hacia allá, paso a paso (sin romper lo que ya funciona)

1. **No reemplaces nada todavía.** Las tablas operativas actuales siguen
   siendo la fuente de verdad para el día a día (login, registrar una
   toma, ver el expediente). Eso no cambia.
2. **Agrega un proceso de "ETL" periódico** (Extract-Transform-Load): un
   script que, cada cierto tiempo (ej. una vez al día, de madrugada), lee
   las tablas operativas, las resume y las copia hacia las nuevas tablas
   de hechos/dimensiones. Puede ser tan simple como un script de Node.js
   que corras con una tarea programada (cron), sin necesidad de
   herramientas empresariales complejas para el tamaño de este proyecto.
3. **La pantalla de análisis pasa a consultar la base analítica**, no la
   operativa. Como ya diseñé el `AnalyticsSummary` como un objeto
   independiente con su propio endpoint (`/analytics/summary`), este paso
   es literalmente cambiar las consultas SQL de adentro de un archivo
   (`analytics.controller.js`) — la app y el resto del backend no se
   enteran del cambio.
4. **Con la base analítica ya poblada**, recién ahí tiene sentido invertir
   en analítica más avanzada: detección de correlaciones entre variables,
   modelos de series de tiempo, o incluso modelos predictivos entrenados
   con el histórico — todo lo que ya dejé listado en la sección
   "En desarrollo" de la pantalla, como roadmap honesto.

## Por qué te recomiendo NO empezar por ahí todavía

Con los datos de un solo paciente de prueba (María Valencia) y unas
semanas de historial, un modelo copo de nieve no te da ninguna ventaja
real — el beneficio de ese diseño aparece cuando hay **volumen** (muchos
pacientes, mucho historial, consultas analíticas pesadas y frecuentes).
Para tu entrega actual, lo que ya implementamos (analítica real basada en
reglas, sin banner de "beta", con datos genuinos) es la base correcta y
honesta sobre la que construir — y el plan de arriba te da un camino claro
para cuando el proyecto crezca lo suficiente para justificarlo.
