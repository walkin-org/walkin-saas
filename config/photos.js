import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const env = process.env;
const directory = path.resolve(env.DATA_DIR || 'data');
const photoDirectory = path.join(directory, 'photos');
export function legacyPhotoReader() {
  if (env.S3_ENDPOINT && !env.S3_BUCKET) throw new Error('S3_BUCKET is required with S3_ENDPOINT');
  if (env.S3_BUCKET) {
    const client = new S3Client({ region: env.AWS_REGION || (env.S3_ENDPOINT ? 'auto' : 'us-east-1'), endpoint: env.S3_ENDPOINT || undefined });
    const object = id => ({ Bucket: env.S3_BUCKET, Key: 'storefronts/' + id });
    return async id => {
      const response = await client.send(new GetObjectCommand(object(id)));
      return Buffer.from(await response.Body.transformToByteArray());
    };
  }
  return id => readFile(path.join(photoDirectory, id));
}
