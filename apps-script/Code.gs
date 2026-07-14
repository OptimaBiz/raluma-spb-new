const CONFIG = Object.freeze({
  recipient: 'anton.karapetian@gmail.com',
  maxFileBytes: 10 * 1024 * 1024,
  uploadLifetimeMs: 24 * 60 * 60 * 1000,
  folderProperty: 'RALUMA_UPLOAD_FOLDER_ID',
  uploadPropertyPrefix: 'RALUMA_UPLOAD_',
});

const ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Run once from the editor before deploying the web app. */
function setup() {
  getUploadFolder_();
  MailApp.getRemainingDailyQuota();
}

function doGet() {
  return ContentService.createTextOutput('Raluma form backend is ready.');
}

function doPost(event) {
  try {
    cleanupExpiredUploads_();

    const params = (event && event.parameter) || {};
    if (String(params.website || '').trim()) {
      return iframeResponse_({ ok: true, type: 'ignored' });
    }

    if (params.action === 'upload') return uploadFile_(params);
    if (params.action === 'submit') return submitLead_(params);

    return iframeResponse_({ ok: false, type: 'error', code: 'UNKNOWN_ACTION' });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return iframeResponse_({ ok: false, type: 'error', code: 'SERVER_ERROR' });
  }
}

function uploadFile_(params) {
  const uploadId = String(params.uploadId || '').trim();
  const fileName = safeFileName_(params.fileName);
  const mimeType = String(params.fileType || '').toLowerCase();
  const encoded = String(params.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');

  if (!/^[a-f0-9-]{36}$/i.test(uploadId)) {
    return iframeResponse_({ ok: false, type: 'upload', code: 'INVALID_UPLOAD_ID' });
  }
  if (!fileName || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return iframeResponse_({ ok: false, type: 'upload', code: 'UNSUPPORTED_FILE' });
  }
  if (!encoded || encoded.length > Math.ceil(CONFIG.maxFileBytes * 4 / 3) + 8) {
    return iframeResponse_({ ok: false, type: 'upload', code: 'FILE_TOO_BIG' });
  }

  const bytes = Utilities.base64Decode(encoded);
  if (!bytes.length || bytes.length > CONFIG.maxFileBytes) {
    return iframeResponse_({ ok: false, type: 'upload', code: 'FILE_TOO_BIG' });
  }

  const properties = PropertiesService.getScriptProperties();
  const propertyKey = uploadPropertyKey_(uploadId);
  const previousUpload = readUpload_(properties.getProperty(propertyKey));
  if (previousUpload) trashFile_(previousUpload.fileId);

  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = getUploadFolder_().createFile(blob);
  const metadata = {
    fileId: file.getId(),
    fileName: fileName,
    mimeType: mimeType,
    size: bytes.length,
    createdAt: Date.now(),
  };
  properties.setProperty(propertyKey, JSON.stringify(metadata));

  return iframeResponse_({
    ok: true,
    type: 'upload',
    uploadId: uploadId,
    fileName: fileName,
    size: bytes.length,
  });
}

function submitLead_(params) {
  const name = String(params.name || '').trim().slice(0, 120);
  const phone = String(params.phone || '').trim().slice(0, 80);
  const comment = String(params.comment || '').trim().slice(0, 1000);
  const uploadId = String(params.uploadId || '').trim();

  if (!name || phone.replace(/\D/g, '').length < 7 || params.consent !== 'yes') {
    return iframeResponse_({ ok: false, type: 'submit', code: 'INVALID_FORM' });
  }

  const properties = PropertiesService.getScriptProperties();
  const propertyKey = uploadId ? uploadPropertyKey_(uploadId) : '';
  const upload = propertyKey ? readUpload_(properties.getProperty(propertyKey)) : null;
  const attachments = [];

  if (uploadId && !upload) {
    return iframeResponse_({ ok: false, type: 'submit', code: 'UPLOAD_NOT_FOUND' });
  }
  if (upload) {
    const file = DriveApp.getFileById(upload.fileId);
    attachments.push(file.getBlob().setName(upload.fileName));
  }

  const submittedAt = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM.yyyy HH:mm');
  const plainBody = [
    'Новая заявка с сайта raluma.com.ru',
    '',
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    `Комментарий: ${comment || '—'}`,
    `Время: ${submittedAt} (МСК)`,
    `Файл: ${upload ? upload.fileName : 'не приложен'}`,
  ].join('\n');

  const htmlBody = [
    '<h2>Новая заявка с сайта raluma.com.ru</h2>',
    '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse">',
    emailRow_('Имя', name),
    emailRow_('Телефон', phone),
    emailRow_('Комментарий', comment || '—'),
    emailRow_('Время', `${submittedAt} (МСК)`),
    emailRow_('Файл', upload ? upload.fileName : 'не приложен'),
    '</table>',
  ].join('');

  MailApp.sendEmail({
    to: CONFIG.recipient,
    subject: 'Raluma SPB — новая заявка',
    body: plainBody,
    htmlBody: htmlBody,
    attachments: attachments,
    name: 'Raluma SPB — форма сайта',
  });

  if (upload) {
    trashFile_(upload.fileId);
    properties.deleteProperty(propertyKey);
  }

  return iframeResponse_({ ok: true, type: 'submit' });
}

function getUploadFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(CONFIG.folderProperty);

  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (_) {
      properties.deleteProperty(CONFIG.folderProperty);
    }
  }

  const folder = DriveApp.createFolder('Raluma — временные вложения формы');
  properties.setProperty(CONFIG.folderProperty, folder.getId());
  return folder;
}

function cleanupExpiredUploads_() {
  const properties = PropertiesService.getScriptProperties();
  const allProperties = properties.getProperties();
  const cutoff = Date.now() - CONFIG.uploadLifetimeMs;

  Object.keys(allProperties).forEach((key) => {
    if (!key.startsWith(CONFIG.uploadPropertyPrefix)) return;
    const upload = readUpload_(allProperties[key]);
    if (!upload || upload.createdAt < cutoff) {
      if (upload) trashFile_(upload.fileId);
      properties.deleteProperty(key);
    }
  });
}

function readUpload_(value) {
  if (!value) return null;
  try {
    const upload = JSON.parse(value);
    return upload && upload.fileId ? upload : null;
  } catch (_) {
    return null;
  }
}

function trashFile_(fileId) {
  if (!fileId) return;
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (_) {}
}

function uploadPropertyKey_(uploadId) {
  return CONFIG.uploadPropertyPrefix + uploadId;
}

function safeFileName_(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 160);
}

function emailRow_(label, value) {
  return `<tr><th align="left" style="border:1px solid #d8dee8;background:#f4f6f8">${escapeHtml_(label)}</th><td style="border:1px solid #d8dee8">${escapeHtml_(value)}</td></tr>`;
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function iframeResponse_(payload) {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(
    `<!doctype html><meta charset="utf-8"><script>parent.postMessage(${safePayload}, '*');<\/script>`,
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
