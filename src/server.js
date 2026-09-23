require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const patientRoutes = require('./routes/patient.routes');
const medicationRoutes = require('./routes/medication.routes');
const studyRoutes = require('./routes/study.routes');
const vitalsRoutes = require('./routes/vitals.routes');
const deviceRoutes = require('./routes/device.routes');
const assistantRoutes = require('./routes/assistant.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/patients', patientRoutes);
app.use('/', medicationRoutes);// expone /patients/:id/medications y /medications/:id
app.use('/', studyRoutes); // expone /patients/:id/studies y /studies/:id
app.use('/', vitalsRoutes); // expone /patients/:id/vitals y /patients/:id/falls
app.use('/', assistantRoutes); // expone /patients/:id/assistant/query y /assistant/logs
app.use('/', analyticsRoutes); // expone /patients/:id/analytics/summary
app.use('/', deviceRoutes); // expone /patients/:id/devices y /devices/ingest

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`YOLIA backend escuchando en http://localhost:${PORT}`);
// });

app.listen(PORT, '127.0.0.1', () => {
  console.log(`YOLIA backend escuchando en http://127.0.0.1:${PORT}`);
});

const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));