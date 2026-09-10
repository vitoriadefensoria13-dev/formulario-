const formidable = require('formidable');
const {
  getDriveClient,
  findOrCreateClientFolder,
  uploadFileToFolder,
} = require('../lib/drive');

// ID extraído do link que a AFM compartilhou:
// https://drive.google.com/drive/folders/1EY-Vsek-zQd48lHODIuWy61KdcYx4un3
const DEFAULT_PARENT_FOLDER_ID = '1EY-Vsek-zQd48lHODIuWy61KdcYx4un3';
const PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || DEFAULT_PARENT_FOLDER_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB por arquivo

// Necessário no runtime Node do Vercel para o formidable poder ler o
// corpo multipart/form-data diretamente do request.
module.exports.config = { api: { bodyParser: false } };

function withCors(res) {
  // Em produção, ALLOWED_ORIGIN deve ser o domínio real do site do
  // escritório — nunca deixe em "*" com dados de cliente trafegando.
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN || 'null');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toArray(maybeArray) {
  if (!maybeArray) return [];
  return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
}

module.exports = async function handler(req, res) {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  let fields;
  let files;
  try {
    const form = formidable({ multiples: true, maxFileSize: MAX_FILE_SIZE });
    ({ fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    }));
  } catch (err) {
    // LGPD: nunca logar o corpo da requisição (pode conter dados pessoais).
    console.error('[submit-caso] falha ao ler o formulário:', err.message);
    res.status(400).json({ ok: false, error: 'invalid_form_data' });
    return;
  }

  const clientName = String((fields && fields.clientName) || '').trim();
  if (!clientName) {
    res.status(400).json({ ok: false, error: 'missing_client_name' });
    return;
  }

  const pdfFile = files && (Array.isArray(files.pdf) ? files.pdf[0] : files.pdf);
  if (!pdfFile) {
    res.status(400).json({ ok: false, error: 'missing_pdf' });
    return;
  }

  try {
    const drive = await getDriveClient();
    const folderId = await findOrCreateClientFolder(drive, PARENT_FOLDER_ID, clientName);

    await uploadFileToFolder(
      drive,
      folderId,
      pdfFile.filepath,
      pdfFile.originalFilename || 'levantamento-de-caso.pdf',
      'application/pdf'
    );

    const attachments = toArray(files && files.documents);
    for (const doc of attachments) {
      await uploadFileToFolder(
        drive,
        folderId,
        doc.filepath,
        doc.originalFilename || 'documento',
        doc.mimetype || 'application/octet-stream'
      );
    }

    // Log apenas do resultado técnico — sem nome do cliente nem conteúdo
    // dos arquivos, para não deixar dados pessoais nos logs da Vercel.
    console.log('[submit-caso] upload concluído. pasta:', folderId, 'arquivos:', attachments.length + 1);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[submit-caso] falha no upload para o Drive:', err.message);
    res.status(502).json({ ok: false, error: 'drive_upload_failed' });
  }
};
