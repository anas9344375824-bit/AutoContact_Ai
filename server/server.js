const path = require('path');
const express = require('express');
const multer = require('multer');
const {
  detectColumns,
  parseCsvBuffer,
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

// Shared pipeline used by both preview and conversion.
function buildContactsFromFile(fileBuffer) {
  const { data, headers } = parseCsvBuffer(fileBuffer);

  if (!headers.length) {
    throw new Error('CSV headers are missing. Please include a header row.');
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
      return res.status(400).json({ error: 'Please upload a CSV file.' });
    }

    const {
      contacts,
      duplicatesRemoved,
      nameCol,
      phoneCol,
      totalRows
    } = buildContactsFromFile(req.file.buffer);

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
      return res.status(400).json({ error: 'Please upload a CSV file.' });
    }

    const { contacts } = buildContactsFromFile(req.file.buffer);

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
