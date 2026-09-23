# YOLIA Backend (Node.js + Express + MySQL)

No usa PHP. WampServer solo se usa para tener el **servicio de MySQL**
corriendo; el servidor de la API es este proyecto Node.js, que corre
por separado (puerto 3000) y se conecta a ese mismo MySQL.

## 1. Preparar la base de datos

1. Abre WampServer y asegúrate de que el ícono esté en verde
   (o al menos que el servicio **MySQL** esté iniciado; puedes apagar
   Apache si no lo necesitas).
2. Abre phpMyAdmin (`http://localhost/phpmyadmin`) o MySQL Workbench/CLI.
3. Ejecuta el contenido de `schema.sql` (pestaña SQL → pegar → Continuar).
   Esto crea la base `yolia_db` con todas las tablas, **sin datos de
   ejemplo** (queda limpia para que tú cargues a tus usuarios reales).

## 2. Configurar el backend

```bash
cd yolia-backend
npm install
cp .env.example .env
```

Edita `.env`:
- Si tu WampServer usa el usuario `root` sin contraseña (configuración
  por defecto), deja `DB_PASSWORD=` vacío.
- Cambia `JWT_SECRET` por una cadena larga propia.

## 3. Ejecutar el servidor

```bash
npm run dev     # con recarga automática (requiere nodemon, ya incluido)
# o
npm start
```

Deberías ver: `YOLIA backend escuchando en http://localhost:3000`

Prueba: abre `http://localhost:3000/health` → debe responder `{"status":"ok"}`

## 4. Exponer el servidor a tu teléfono / a otros dispositivos

Para que la app Flutter (en tu celular o el de otra persona) llegue a
este backend, ambos dispositivos deben estar en la misma red, o debes
exponer el puerto 3000 (por ejemplo con un túnel como `ngrok` durante
pruebas, o desplegando el backend en un servicio en la nube más adelante
para producción real). En la app Flutter, la URL base de la API
(`baseUrl`) debe apuntar a la IP de la máquina donde corre este backend,
por ejemplo `http://192.168.1.50:3000`, no a `localhost` (localhost en
el celular se refiere al propio celular).

## 5. Primeros usuarios

No hay datos precargados. Crea tus primeros usuarios llamando a
`POST /auth/register`:

```json
{
  "fullName": "Nombre del cuidador",
  "email": "correo@ejemplo.com",
  "password": "contraseña segura",
  "role": "caregiver"
}
```

Roles válidos: `admin`, `doctor`, `caregiver`, `elderly`.
Cuando registres un usuario con rol `elderly`, se crea automáticamente
su perfil clínico vacío en la tabla `patients`, listo para que un
cuidador lo complete con `PUT /patients/:patientId`.

## 6. Reglas de permisos ya implementadas

| Acción                                   | Doctor | Cuidador | Adulto mayor |
|-------------------------------------------|:------:|:--------:|:------------:|
| Ver perfil del paciente                   | ✅ (si asignado) | ✅ (si asignado) | ✅ (propio) |
| Editar perfil del paciente                | ❌ | ✅ | ❌ |
| Añadir/editar medicamentos (nombre, dosis)| ✅ | ❌ | ❌ |
| Marcar medicamento como tomado/no tomado  | ❌ | ✅ | ✅ (solo el suyo) |
| Añadir/editar estudios médicos            | ✅ | ❌ | ❌ |
| Registrar signos vitales manualmente      | ❌ | ✅ | ❌ |
| Resolver alertas de caída                 | ❌ | ✅ | ✅ (solo la suya) |

Todas las rutas validan además que el doctor/cuidador esté realmente
**asignado** a ese paciente (tablas `patient_doctors` / `patient_caregivers`),
así que la información de distintos adultos mayores nunca se mezcla
entre cuentas.

## 7. Sobre el futuro log del asistente de voz (Claude API)

Ya existe la tabla `ai_assistant_logs` (patient_id, spoken_by, flow_type,
query_text, response_text, function_called, tokens_used, latency_ms,
created_at), lista para que cuando conectes el módulo de voz solo
insertes un registro por cada interacción, sin tener que rediseñar el
esquema.
