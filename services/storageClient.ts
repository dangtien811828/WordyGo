/**
 * Cloudflare R2 storage client (S3-compatible).
 *
 * Lazy init: the S3Client is constructed on first use so missing envs only fail when
 * the storage path is actually exercised, not at module load.
 */
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 storage not configured: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY required'
    );
  }

  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error('R2_BUCKET environment variable is not set');
  return bucket;
}

function getPublicUrl(): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) throw new Error('R2_PUBLIC_URL environment variable is not set');
  return publicUrl.replace(/\/+$/, '');
}

/**
 * Upload an MP3 buffer to R2 under the given key.
 * Returns the public URL `${R2_PUBLIC_URL}/${key}`.
 */
export async function uploadAudio(key: string, buffer: Buffer): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: 'audio/mpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return `${getPublicUrl()}/${key}`;
}

/**
 * HEAD probe — true if object exists, false on 404 / NotFound.
 */
export async function audioExists(key: string): Promise<boolean> {
  try {
    await getClient().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key })
    );
    return true;
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') {
      return false;
    }
    throw err;
  }
}
