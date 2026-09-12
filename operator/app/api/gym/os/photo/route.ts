import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { gymPhotoDirectory, recordProgressPhoto } from '@/lib/gym/db';

export const runtime = 'nodejs';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const date = String(form.get('date') ?? '');
    const view = String(form.get('view') ?? '');
    const photo = form.get('photo');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['front', 'side', 'back'].includes(view)) {
      return NextResponse.json({ error: 'Choose a valid date and photo view.' }, { status: 400 });
    }
    if (!(photo instanceof File) || !MIME_EXTENSIONS[photo.type] || photo.size <= 0 || photo.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Upload a JPG, PNG or WebP image up to 10 MB.' }, { status: 400 });
    }
    const filename = `${date}-${view}-${crypto.randomUUID()}${MIME_EXTENSIONS[photo.type]}`;
    let storagePath: string;
    let storedLocally = false;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`gym-progress/${filename}`, photo, {
        access: 'private',
        addRandomSuffix: false,
        contentType: photo.type,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      storagePath = blob.pathname;
    } else if (process.env.NODE_ENV !== 'production') {
      const fullPath = path.join(gymPhotoDirectory(), filename);
      await fs.writeFile(fullPath, Buffer.from(await photo.arrayBuffer()));
      storagePath = fullPath;
      storedLocally = true;
    } else {
      throw new Error('BLOB_READ_WRITE_TOKEN is not configured.');
    }
    await recordProgressPhoto({ date, view, localPath: storagePath, originalName: photo.name });
    return NextResponse.json({ ok: true, filename, storedLocally });
  } catch (error) {
    console.error('[api/gym/os/photo POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save progress photo.' }, { status: 500 });
  }
}
