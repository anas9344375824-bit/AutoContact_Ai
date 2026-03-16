const Papa = require('papaparse');

const NAME_KEYWORDS = ['name', 'fullname', 'person'];
const PHONE_KEYWORDS = ['phone', 'mobile', 'number', 'contact', 'cell', 'tel'];

// Normalize header names so matching is consistent.
function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function scoreHeader(normalized, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) score += 1;
  }
  return score;
}

// Pick the most likely name and phone columns using keyword scoring.
function detectColumns(headers) {
  const scored = headers.map((header) => {
    const normalized = normalizeHeader(header);
    return {
      header,
      normalized,
      nameScore: scoreHeader(normalized, NAME_KEYWORDS),
      phoneScore: scoreHeader(normalized, PHONE_KEYWORDS)
    };
  });

  const nameCandidates = scored
    .filter((item) => item.nameScore > 0)
    .sort((a, b) => b.nameScore - a.nameScore);

  const phoneCandidates = scored
    .filter((item) => item.phoneScore > 0)
    .sort((a, b) => b.phoneScore - a.phoneScore);

  let nameCol = nameCandidates[0]?.header || null;
  let phoneCol = phoneCandidates[0]?.header || null;

  if (nameCol && phoneCol && nameCol === phoneCol) {
    const altName = nameCandidates.find((item) => item.header !== phoneCol);
    const altPhone = phoneCandidates.find((item) => item.header !== nameCol);

    if (altName && (!altPhone || altName.nameScore >= altPhone.phoneScore)) {
      nameCol = altName.header;
    } else if (altPhone) {
      phoneCol = altPhone.header;
    }
  }

  return { nameCol, phoneCol };
}

// Parse CSV into rows + headers using PapaParse.
function parseCsvBuffer(buffer) {
  const csvText = buffer.toString('utf8');
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => String(header || '').trim()
  });

  if (result.errors && result.errors.length > 0) {
    const message = result.errors[0].message || 'Failed to parse CSV.';
    throw new Error(message);
  }

  const headers = result.meta?.fields || [];
  return { data: result.data || [], headers };
}

// Clean phone numbers by keeping digits and a leading +.
function cleanPhone(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';

  const first = trimmed.split(/[;,/|]/)[0].trim();
  let cleaned = first.replace(/[^\d+]/g, '');
  cleaned = cleaned.replace(/(?!^)\+/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length < 6) return '';

  return cleaned;
}

// Escape commas, semicolons, and newlines per vCard rules.
function escapeVcardValue(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// Build contact objects from CSV rows.
function buildContacts(rows, nameCol, phoneCol) {
  const contacts = [];

  for (const row of rows) {
    const rawName = String(row[nameCol] || '').trim();
    const rawPhone = String(row[phoneCol] || '').trim();
    const phone = cleanPhone(rawPhone);

    if (!phone) continue;
    const name = rawName || phone;

    contacts.push({ name, phone });
  }

  return contacts;
}

// Remove duplicates by name + phone key.
function dedupeContacts(contacts) {
  const uniqueContacts = [];
  const seen = new Set();
  let duplicatesRemoved = 0;

  for (const contact of contacts) {
    const key = `${contact.name.toLowerCase()}|${contact.phone}`;
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    uniqueContacts.push(contact);
  }

  return { uniqueContacts, duplicatesRemoved };
}

// Generate VCF 3.0 output for a list of contacts.
function generateVcf(contacts) {
  const lines = [];

  for (const contact of contacts) {
    lines.push('BEGIN:VCARD');
    lines.push('VERSION:3.0');
    lines.push(`FN:${escapeVcardValue(contact.name)}`);
    lines.push(`TEL;TYPE=CELL:${contact.phone}`);
    lines.push('END:VCARD');
  }

  return lines.join('\n');
}

module.exports = {
  detectColumns,
  parseCsvBuffer,
  buildContacts,
  dedupeContacts,
  generateVcf
};
