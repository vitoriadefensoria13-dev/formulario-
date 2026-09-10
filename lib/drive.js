const { google } = require('googleapis');
const fs = require('fs');

/**
 * Autentica com uma Service Account do Google. A chave nunca fica no
 * código-fonte: vem de uma variável de ambiente (base64 do JSON da
 * service account), configurada apenas no painel do Vercel.
 */
function getAuth() {
  const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!keyBase64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 não configurada');
  }
  const credentials = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

/** Remove caracteres que o Drive não aceita bem em nomes de pasta e limita o tamanho. */
function sanitizeFolderName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || 'Cliente sem nome';
}

/**
 * Procura uma subpasta com o nome da cliente dentro da pasta compartilhada
 * do escritório; cria se ainda não existir. Idempotente: reenvios do mesmo
 * caso caem na mesma pasta em vez de duplicar.
 */
async function findOrCreateClientFolder(drive, parentFolderId, clientName) {
  const safeName = sanitizeFolderName(clientName);
  const escaped = safeName.replace(/'/g, "\\'");
  const q = `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`;

  const existing = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  });

  return created.data.id;
}

async function uploadFileToFolder(drive, folderId, filePath, fileName, mimeType) {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || 'application/octet-stream',
      body: fs.createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });
  return res.data;
}

module.exports = {
  getDriveClient,
  findOrCreateClientFolder,
  uploadFileToFolder,
  sanitizeFolderName,
};
