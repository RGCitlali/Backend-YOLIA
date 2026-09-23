# Asistente de voz YOLIA — cómo funciona y cómo activarlo

## 1. Dónde pagar / obtener tu clave de API

1. Ve a **https://platform.claude.com** (la consola de desarrolladores de
   Anthropic — es un sitio distinto a claude.ai) y crea una cuenta.
2. En el menú lateral: **Settings → Billing** → agrega un método de pago.
   Las cuentas nuevas reciben algunos créditos gratuitos de prueba; para
   seguir usándola después de que se agoten necesitas tarjeta registrada.
   No es una suscripción mensual: se cobra por tokens (texto) realmente
   usados. Puedes poner un límite de gasto mensual desde esa misma sección
   para no llevarte sorpresas.
3. En **Settings → API Keys** → **Create key**. Cópiala de inmediato (solo
   se muestra una vez); empieza con `sk-ant-`.
4. Pégala en tu backend, en el archivo `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-tu-clave-aqui
   ```

**Nunca subas esta clave a GitHub ni la pongas dentro del código de
Flutter** — por eso vive únicamente en el backend (`.env`), y la app
nunca habla directo con la API de Claude, solo con tu backend.

## 2. Qué modelo se usa y por qué

Por defecto uso **`claude-haiku-4-5-20251001`**: es el modelo más rápido y
económico de Anthropic, ideal para un asistente de voz donde importa que
la respuesta llegue rápido. Si en algún momento las respuestas te parecen
poco elaboradas, puedes cambiar a un modelo más capaz editando una sola
línea en tu `.env`:
```
ANTHROPIC_MODEL=claude-sonnet-5
```
(Sonnet es más lento y más caro por token que Haiku, pero da respuestas
más elaboradas — normalmente Haiku es suficiente para este caso de uso.)

## 3. Arquitectura de seguridad (por qué se diseñó así)

**Dos flujos separados**, tal como lo platicamos:

### a) Protocolo fijo de emergencia
Antes de llamar al modelo, el backend revisa el texto transcrito contra
una lista de palabras/frases de alerta (`src/data/emergency_keywords.js`
— "me caí", "no puedo respirar", "dolor en el pecho", etc.). Si hay
coincidencia:
- Se responde con un texto FIJO y predefinido (no generado por IA).
- Es prácticamente instantáneo (no hay que esperar a la API).
- Su comportamiento es 100% predecible — importante ante una posible
  urgencia real, donde no quieres que un modelo de lenguaje "improvise".
- Igual se guarda en el log del cuidador, marcado como `emergency`.

Este listado de palabras debe revisarlo y ampliarlo alguien con criterio
clínico antes de un uso real más allá de tu proyecto académico.

### b) Flujo informativo (preguntas generales)
Si no hay señales de emergencia, se arma una consulta a Claude con tres
capas de contexto:
1. **Instrucciones del sistema** (`src/services/anthropic.service.js`,
   constante `SYSTEM_PROMPT`) que le prohíben explícitamente diagnosticar
   o recomendar tratamientos/dosis específicas, y le piden remitir esas
   decisiones al médico.
2. **Base de conocimiento curada** (`src/data/health_knowledge_base.js`):
   textos educativos generales (presión arterial, glucosa, prevención de
   caídas, etc.) que se inyectan como contexto solo si las palabras de la
   pregunta coinciden con el tema. Esto reduce que el modelo "invente"
   información médica.
3. **Function calling con datos reales**: el modelo puede llamar a
   `get_medications` o `get_latest_vitals`, que ejecutan consultas
   SQL reales, filtradas siempre por el `patientId` de la sesión — así,
   si el paciente pregunta "¿ya tomé mi pastilla de la tarde?", la
   respuesta se basa en su registro real, no en una alucinación.

### c) El log del cuidador
Cada intercambio (pregunta + respuesta, sea emergencia o informativo) se
guarda en la tabla `ai_assistant_logs` con quién habló, qué flujo se usó,
qué función se consultó (si aplica), tokens usados, y tiempo de respuesta.
El cuidador lo ve como una conversación tipo chat desde
`AssistantLogScreen` en la app — de solo lectura, no puede editarlo.

## 4. Por qué las respuestas son rápidas

- Emergencias: no se llama al modelo, es instantáneo.
- Informativas: se usa Haiku (el modelo más rápido de Anthropic),
  `max_tokens: 350` (respuestas cortas, pensadas para leerse en voz alta),
  y como máximo 3 "vueltas" de function calling para no alargar la espera.
- La app reproduce la respuesta con voz (`flutter_tts`) apenas llega el
  texto — no espera a nada adicional.

## 5. Prueba rápida por línea de comandos (antes de probar en la app)

Con el backend corriendo y tu `.env` configurado:
```bash
curl -X POST http://localhost:3000/patients/1/assistant/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_JWT" \
  -d '{"queryText": "¿cuáles son mis medicinas de hoy?"}'
```
(Obtén `TU_TOKEN_JWT` del login normal — es el mismo que usa la app.)
