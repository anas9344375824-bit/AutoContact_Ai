const path = require('path');
const express = require('express');
const multer = require('multer');
const {
  detectColumns,
  parseCsvBuffer,
  parseExcelBuffer,
  buildContacts,
  dedupeContacts,
  generateVcf
} = require('./vcfGenerator');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const publicDir = path.resolve(__dirname, '..', 'public');
// Serve the static frontend.
app.use(express.static(publicDir));

const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xlsm', '.xltx', '.xls']);
const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template'
]);

function parseFile(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();

  if (EXCEL_EXTENSIONS.has(extension) || EXCEL_MIME_TYPES.has(mimeType)) {
    return parseExcelBuffer(file.buffer);
  }

  if (extension === '.csv' || extension === '.txt' || mimeType.includes('csv')) {
    return parseCsvBuffer(file.buffer);
  }

  throw new Error('Unsupported file type. Please upload a CSV or Excel file.');
}

// Shared pipeline used by both preview and conversion.
function buildContactsFromFile(file) {
  const { data, headers } = parseFile(file);

  if (!headers.length) {
    throw new Error('Header row is missing. Please include column names.');
  }

  const { nameCol, phoneCol } = detectColumns(headers);

  if (!nameCol || !phoneCol) {
    throw new Error(
      'Could not detect name and phone columns. Please use headers like name and phone.'
    );
  }

  const contacts = buildContacts(data, nameCol, phoneCol);
  const { uniqueContacts, duplicatesRemoved } = dedupeContacts(contacts);

  return {
    contacts: uniqueContacts,
    duplicatesRemoved,
    nameCol,
    phoneCol,
    totalRows: data.length
  };
}

// Preview endpoint: returns the first 10 cleaned contacts.
app.post('/api/preview', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a CSV or Excel file.' });
    }

    const {
      contacts,
      duplicatesRemoved,
      nameCol,
      phoneCol,
      totalRows
    } = buildContactsFromFile(req.file);

    return res.json({
      detected: { nameCol, phoneCol },
      totalRows,
      usableContacts: contacts.length,
      duplicatesRemoved,
      preview: contacts.slice(0, 10)
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Preview failed.' });
  }
});

// Convert endpoint: returns a downloadable VCF file.
app.post('/api/convert', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a CSV or Excel file.' });
    }

    const { contacts } = buildContactsFromFile(req.file);

    if (!contacts.length) {
      return res
        .status(400)
        .json({ error: 'No valid contacts found after cleaning.' });
    }

    const vcf = generateVcf(contacts);

    res.set({
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contacts.vcf"'
    });

    return res.send(vcf);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Conversion failed.' });
  }
});

// SPA-style fallback.
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`CSV Contact AI running on http://localhost:${port}`);
});
