import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { prisma } from '../lib/prisma';
import { ApiError } from '../errors/api-error';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const AVATAR_IDS = ['scholar-1', 'scholar-2', 'scholar-3', 'scholar-4', 'scholar-5', 'scholar-6', 'books', 'justice'] as const;
export type Photo = { kind: 'default' } | { kind: 'avatar'; avatarId: string; version: string } | { kind: 'image'; dataUrl: string; version: string };

// Decoder allowlist, pixel limit and re-encoding prevent SVG, metadata and
// executable/trailing bytes from being stored, regardless of claimed MIME/name.
export async function normalizePhoto(input: Buffer): Promise<Buffer> {
  if (!input.length) throw new ApiError(422, 'Selecione uma imagem JPEG, PNG ou WebP.');
  if (input.length > MAX_PHOTO_BYTES) throw new ApiError(413, 'A imagem deve ter no máximo 5 MB.');
  const format = input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'jpeg'
    : input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
    : input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!format) throw new ApiError(415, 'Formato não permitido. Use JPEG, PNG ou WebP.');
  try {
    const decoder = sharp(input, { limitInputPixels: 16_000_000, failOn: 'warning' });
    const meta = await decoder.metadata();
    if (meta.format !== format || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width > 8192 || meta.height > 8192) throw new Error('Unsupported image');
    const output = await decoder.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    if (output.length > 262144) throw new Error('Output limit');
    return output;
  } catch {
    throw new ApiError(422, 'Imagem inválida ou muito complexa. Use uma imagem estática de até 16 megapixels.');
  }
}

export class ProfilePhotoService {
  async get(userId: string): Promise<Photo> {
    const row = await prisma.profilePhoto.findUnique({ where: { userId } });
    if (!row) return { kind: 'default' };
    return row.avatarId ? { kind: 'avatar', avatarId: row.avatarId, version: row.version }
      : { kind: 'image', dataUrl: `data:image/webp;base64,${Buffer.from(row.image!).toString('base64')}`, version: row.version };
  }
  private async store(userId: string, content: { avatarId: string | null; image: Buffer | null }) {
    // Explicitly lock the same User row as account anonymization. A racing
    // upload cannot recreate a photo after deletion/confirmation revocation.
    const data = { avatarId: content.avatarId, image: content.image ? Uint8Array.from(content.image) : null };
    await prisma.$transaction(async tx => {
      const owners = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "deletedAt" IS NULL AND "emailVerifiedAt" IS NOT NULL FOR UPDATE`;
      if (!owners.length) throw new ApiError(401, 'Sessão inválida.');
      await tx.user.update({ where: { id: userId }, data: { profilePhotos: {
        upsert: { where: { userId }, create: { ...data, version: randomUUID() }, update: { ...data, version: randomUUID() } },
      } }, select: { id: true } });
    });
    return this.get(userId);
  }
  avatar(userId: string, avatarId: string) { return this.store(userId, { avatarId, image: null }); }
  async upload(userId: string, input: Buffer) { return this.store(userId, { avatarId: null, image: await normalizePhoto(input) }); }
  async remove(userId: string): Promise<Photo> {
    await prisma.profilePhoto.deleteMany({ where: { userId } });
    return { kind: 'default' };
  }
}
