import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';

// Track S3 delete failures for diagnostics
const deleteFailures = [];
const MAX_TRACKED_FAILURES = 100; // Keep last 100 failures

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadToS3 = async (filePath, folder = 'uploads') => {
  if (!filePath) {
    throw new Error('uploadToS3: filePath is required');
  }

  const bucket = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket) throw new Error('Missing env var: AWS_BUCKET_NAME or S3_BUCKET_NAME');
  if (!region) throw new Error('Missing env var: AWS_REGION');

  const fileStream = fs.createReadStream(filePath);
  const ext = path.extname(filePath) || '';
  const key = `${folder}/${Date.now()}-${uuidv4()}${ext}`;

  const contentType = mime.lookup(ext) || 'application/octet-stream';

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  });

  try {
    await s3.send(command);

    // Prefer explicitly configured CDN/base URL for public access.
    // When bucket ACLs are disabled, public access should be handled via bucket policy / CloudFront / OAC.
    const url = process.env.S3_PUBLIC_BASE_URL
      ? `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
      : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return { url, key };
  } catch (error) {
    console.error('✗ S3 Upload Error:', {
      message: error?.message,
      name: error?.name,
      code: error?.$metadata?.httpStatusCode,
      bucket,
      key,
    });
    throw error;
  }
};

const extractS3KeyFromUrl = (url, bucket, region) => {
  if (!url) return null;

  const normalizedBucket = bucket || process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  const normalizedRegion = region || process.env.AWS_REGION;
  const baseUrl = normalizedBucket && normalizedRegion
    ? `https://${normalizedBucket}.s3.${normalizedRegion}.amazonaws.com`
    : null;

  if (baseUrl && url.startsWith(baseUrl)) {
    return url.replace(`${baseUrl}/`, '');
  }

  const idx = url.indexOf('amazonaws.com/');
  if (idx !== -1) {
    return url.substring(idx + 'amazonaws.com/'.length);
  }

  const segments = url.split('/').filter(Boolean);
  return segments.slice(-2).join('/');
};

export const deleteFromS3 = async (keyOrUrl) => {
  try {
    if (!keyOrUrl) return;
    const bucket = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    if (!bucket) throw new Error('Missing env var: AWS_BUCKET_NAME or S3_BUCKET_NAME');

    const key = extractS3KeyFromUrl(keyOrUrl, bucket, region) || keyOrUrl;

    const params = {
      Bucket: bucket,
      Key: key,
    };
    await s3.send(new DeleteObjectCommand(params));
    return true;
  } catch (error) {
    const message = error?.message || error;
    const code = error?.Code || error?.name || error?.$metadata?.httpStatusCode;
    const key = extractS3KeyFromUrl(keyOrUrl) || keyOrUrl;

    console.warn('⚠️ S3 Delete Warning:', {
      message,
      code,
      bucket: process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME,
      key,
    });

    // Track failure for admin diagnostics
    if (code === 'AccessDenied' || error?.name === 'AccessDenied') {
      deleteFailures.push({
        timestamp: new Date().toISOString(),
        key,
        reason: message,
        code,
      });
      if (deleteFailures.length > MAX_TRACKED_FAILURES) {
        deleteFailures.shift(); // Remove oldest
      }
    }

    if (
      error?.Code === 'AccessDenied' ||
      error?.Code === 'AllAccessDisabled' ||
      error?.Code === 'NoSuchKey' ||
      error?.name === 'AccessDenied'
    ) {
      return false;
    }

    throw error;
  }
};

export const getS3DeleteFailures = () => deleteFailures;
export const clearS3DeleteFailures = () => {
  const count = deleteFailures.length;
  deleteFailures.length = 0;
  return count;
};

export default s3;