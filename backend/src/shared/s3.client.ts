import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client as AwsS3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PRESIGNED_URL_EXPIRES_SEC } from '../scan/scan.constants';

@Injectable()
export class S3Client {
  private readonly logger = new Logger(S3Client.name);
  private readonly client: AwsS3Client;
  private readonly bucket: string;

  constructor() {
    const region = process.env.AWS_REGION ?? 'ap-northeast-1';
    this.bucket = process.env.S3_BUCKET_NAME ?? '';
    this.client = new AwsS3Client({ region });
  }

  /**
   * S3 に画像を PUT するための Presigned URL を生成する。
   * Presigned URL の有効期限は PRESIGNED_URL_EXPIRES_SEC（5分）。
   */
  async generatePresignedPutUrl(s3Key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: 'image/jpeg',
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_SEC,
    });
    this.logger.log(`Presigned PUT URL generated for key: ${s3Key}`);
    return url;
  }

  /**
   * S3 から画像を取得して base64 文字列で返す。
   * 取得失敗時は null を返す（呼び出し元で 400 エラーに変換する）。
   */
  async getImageAsBase64(s3Key: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });
      const response = await this.client.send(command);
      if (!response.Body) {
        this.logger.error(`S3 response body is empty for key: ${s3Key}`);
        return null;
      }
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes).toString('base64');
    } catch (error) {
      this.logger.error(
        `S3 getObject failed for key: ${s3Key}`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }
}
