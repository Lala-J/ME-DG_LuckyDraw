// Sanitises user-supplied strings before they are stored in audit log tables.
// HTML-encodes special characters and strips ASCII control characters, then
// enforces a maximum length so that malicious input cannot pollute the audit
// record or cause XSS when the value is later rendered by the admin frontend.
// Encoding (rather than stripping) preserves data integrity — names like
// "O'Brien" are stored as "O&#39;Brien" instead of being corrupted to "OBrien".

const HTML_ENCODE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function sanitizeAuditInput(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\x00-\x1F\x7F]/g, '')                       // strip ASCII control characters
    .replace(/[&<>"']/g, ch => HTML_ENCODE_MAP[ch] || ch)   // HTML-encode special characters
    .trim()
    .slice(0, 300);                                         // cap length
}

module.exports = { sanitizeAuditInput };
