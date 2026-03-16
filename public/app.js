const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileName = document.getElementById('fileName');
const previewBody = document.getElementById('previewBody');
const detectedColumns = document.getElementById('detectedColumns');
const rowCount = document.getElementById('rowCount');
const usableCount = document.getElementById('usableCount');
const duplicateCount = document.getElementById('duplicateCount');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusEl = document.getElementById('status');

let currentFile = null;
let vcfBlobUrl = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('text-rose-300', isError);
  statusEl.classList.toggle('text-slate-300', !isError);
}

// Escape CSV values before inserting into the preview table.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resetDownload() {
  if (vcfBlobUrl) {
    URL.revokeObjectURL(vcfBlobUrl);
    vcfBlobUrl = null;
  }
  downloadBtn.disabled = true;
}

function resetPreview() {
  previewBody.innerHTML = `
    <tr>
      <td class="px-4 py-3 text-slate-500" colspan="2">
        Upload a CSV to see a preview.
      </td>
    </tr>
  `;
  detectedColumns.textContent = '';
  rowCount.textContent = 'Rows: 0';
  usableCount.textContent = 'Usable contacts: 0';
  duplicateCount.textContent = 'Duplicates removed: 0';
  convertBtn.disabled = true;
  resetDownload();
}

function isCsvFile(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || file.type.includes('csv');
}

// Ask the backend to parse and preview the first 10 contacts.
async function requestPreview(file) {
  const formData = new FormData();
  formData.append('file', file);

  setStatus('Analyzing CSV and detecting columns...');
  convertBtn.disabled = true;
  resetDownload();

  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      body: formData
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Preview failed.');
    }

    detectedColumns.textContent = `Detected: ${payload.detected.nameCol} + ${payload.detected.phoneCol}`;
    rowCount.textContent = `Rows: ${payload.totalRows}`;
    usableCount.textContent = `Usable contacts: ${payload.usableContacts}`;
    duplicateCount.textContent = `Duplicates removed: ${payload.duplicatesRemoved}`;

    if (!payload.preview.length) {
      previewBody.innerHTML = `
        <tr>
          <td class="px-4 py-3 text-slate-500" colspan="2">
            No valid contacts found after cleaning.
          </td>
        </tr>
      `;
      setStatus('No valid contacts found.');
      return;
    }

    previewBody.innerHTML = payload.preview
      .map(
        (contact) => `
        <tr class="border-t border-slate-800">
          <td class="px-4 py-3">${escapeHtml(contact.name)}</td>
          <td class="px-4 py-3">${escapeHtml(contact.phone)}</td>
        </tr>
      `
      )
      .join('');

    convertBtn.disabled = false;
    setStatus('Preview ready. You can convert to VCF.');
  } catch (error) {
    setStatus(error.message || 'Preview failed.', true);
    resetPreview();
  }
}

// Request the generated VCF and store it for download.
async function convertToVcf() {
  if (!currentFile) return;

  const formData = new FormData();
  formData.append('file', currentFile);

  setStatus('Generating VCF file...');
  convertBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || 'Conversion failed.');
    }

    const blob = await response.blob();
    vcfBlobUrl = URL.createObjectURL(blob);
    downloadBtn.disabled = false;
    setStatus('VCF ready. Click download.');
  } catch (error) {
    setStatus(error.message || 'Conversion failed.', true);
  } finally {
    convertBtn.disabled = false;
  }
}

function triggerDownload() {
  if (!vcfBlobUrl) return;
  const link = document.createElement('a');
  link.href = vcfBlobUrl;
  link.download = 'contacts.vcf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setStatus('Download started.');
}

function handleFile(file) {
  if (!isCsvFile(file)) {
    setStatus('Please upload a valid .csv file.', true);
    resetPreview();
    currentFile = null;
    fileName.textContent = '';
    return;
  }

  currentFile = file;
  fileName.textContent = file.name;
  requestPreview(file);
}

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  handleFile(event.target.files[0]);
});

convertBtn.addEventListener('click', convertToVcf);
downloadBtn.addEventListener('click', triggerDownload);

// Drag and drop experience for the upload card.
['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.add('is-dragover');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropZone.classList.remove('is-dragover');
  });
});

dropZone.addEventListener('drop', (event) => {
  const [file] = event.dataTransfer.files;
  handleFile(file);
});

resetPreview();
setStatus('Ready for a CSV file.');
