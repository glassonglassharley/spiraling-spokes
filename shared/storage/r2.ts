import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

let client: S3Client | null = null;

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function cdnUrl(key: string): string {
  const base = process.env.R2_CDN_URL;
  if (base) return `${base}/${key}`;
  return `http://localhost:${process.env.PORT ?? 8080}/static/${key}`;
}

export async function r2Get(key: string): Promise<Buffer | null> {
  if (!isR2Configured()) return null;
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    throw err;
  }
}

export async function r2Exists(key: string): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

export async function r2Put(
  key: string,
  body: Buffer,
  contentType = 'application/octet-stream'
): Promise<void> {
  if (!isR2Configured()) return;
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
