const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listDocuments, createDocument, downloadDocument, deleteDocument,
} = require('../controllers/document.controller');

// La autenticación se aplica ruta por ruta (no con router.use) para no
// interceptar peticiones de otros routers montados en '/'.
router.get('/patients/:patientId/documents', authenticate, listDocuments);
router.post('/patients/:patientId/documents', authenticate, createDocument);
router.get('/documents/:documentId/file', authenticate, downloadDocument);
router.delete('/documents/:documentId', authenticate, deleteDocument);

module.exports = router;