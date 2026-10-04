// src/lib/google-drive.ts
// Upload files lên Google Drive
// Cấu trúc: VPDT_Archive/<ngày>/<số văn bản>/

import { getValidAccessToken } from './google-oauth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Tìm hoặc tạo folder trong Drive
 */
async function findOrCreateFolder(
  name: string,
  parentId: string | null,
  token: string
): Promise<string> {
  // Tìm folder đã tồn tại
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false` +
    (parentId ? ` and '${parentId}' in parents` : '');

  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json() as { files?: { id: string }[] };

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Tạo folder mới
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) metadata.parents = [parentId];

  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });
  const created = await createRes.json() as { id: string };
  return created.id;
}

/**
 * Upload file lên Drive
 */
export async function uploadFile(
  filename: string,
  content: Buffer | string,
  mimeType: string,
  folderId: string
): Promise<{ fileId: string; webViewLink: string }> {
  const token = await getValidAccessToken();

  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

  // Multipart upload
  const boundary = 'vpdt_boundary_' + Date.now();
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: filename, parents: [folderId] }) +
    `\r\n`;
  const mediaPart =
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metadataPart),
    Buffer.from(mediaPart),
    buffer,
    Buffer.from(closing),
  ]);

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    }
  );

  const data = await res.json() as { id?: string; webViewLink?: string; error?: unknown };
  if (!data.id) throw new Error(`Drive upload thất bại: ${JSON.stringify(data.error)}`);

  return { fileId: data.id, webViewLink: data.webViewLink ?? '' };
}

/**
 * Tạo cấu trúc folder và upload tất cả files của một văn bản
 * Cấu trúc: VPDT_Archive/<ngày>/<số văn bản>/
 */
export async function uploadDocument(params: {
  soVanBan: string;
  ngay: string; // YYYY-MM-DD
  metadataJson: string;
  contentHtml: string;
  attachments: { name: string; buffer: Buffer; mimeType: string }[];
}): Promise<{ folderId: string; fileIds: string[]; webLinks: string[] }> {
  const token = await getValidAccessToken();

  // Tạo root folder
  const rootId = await findOrCreateFolder('VPDT_Archive', null, token);

  // Tạo folder theo ngày
  const dateFolder = params.ngay.slice(0, 10); // YYYY-MM-DD
  const dateFolderId = await findOrCreateFolder(dateFolder, rootId, token);

  // Tạo folder theo số văn bản
  const docFolderName = params.soVanBan || `doc_${Date.now()}`;
  const docFolderId = await findOrCreateFolder(docFolderName, dateFolderId, token);

  const fileIds: string[] = [];
  const webLinks: string[] = [];

  // Upload metadata.json
  const meta = await uploadFile('metadata.json', params.metadataJson, 'application/json', docFolderId);
  fileIds.push(meta.fileId);
  webLinks.push(meta.webViewLink);

  // Upload content.html
  const content = await uploadFile('content.html', params.contentHtml, 'text/html', docFolderId);
  fileIds.push(content.fileId);
  webLinks.push(content.webViewLink);

  // Upload attachments
  for (const att of params.attachments) {
    const uploaded = await uploadFile(att.name, att.buffer, att.mimeType, docFolderId);
    fileIds.push(uploaded.fileId);
    webLinks.push(uploaded.webViewLink);
  }

  return { folderId: docFolderId, fileIds, webLinks };
}
