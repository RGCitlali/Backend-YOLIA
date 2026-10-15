const NAME_RE  = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;
const ADDR_RE  = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .,#°\-\/]+$/;
const PHONE_RE = /^\d{10}$/;

const clean = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

function validateFullName(v, { required = true } = {}) {
  const s = clean(v);
  if (!s) return required ? { ok: false, error: 'El nombre es obligatorio' } : { ok: true, value: '' };
  if (s.length < 3 || s.length > 150) return { ok: false, error: 'El nombre debe tener entre 3 y 150 caracteres' };
  if (!NAME_RE.test(s)) return { ok: false, error: 'El nombre solo puede contener letras y espacios' };
  return { ok: true, value: s };
}

function validateAddress(v, { required = true } = {}) {
  const s = clean(v);
  if (!s) return required ? { ok: false, error: 'La dirección es obligatoria' } : { ok: true, value: '' };
  if (s.length < 5 || s.length > 255) return { ok: false, error: 'La dirección debe tener entre 5 y 255 caracteres' };
  if (!ADDR_RE.test(s)) return { ok: false, error: 'La dirección solo admite letras, números y . , # - /' };
  return { ok: true, value: s };
}

function validatePhone(v, { required = true } = {}) {
  const s = String(v ?? '').trim();
  if (!s) return required ? { ok: false, error: 'El teléfono es obligatorio' } : { ok: true, value: '' };
  if (!PHONE_RE.test(s)) return { ok: false, error: 'El teléfono debe tener exactamente 10 dígitos numéricos' };
  return { ok: true, value: s };
}

module.exports = { validateFullName, validateAddress, validatePhone };