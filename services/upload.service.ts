import axios from 'axios';
import { config } from '@/config';

interface CloudinaryUploadResponse {
  public_id: string;
  version: number;
  signature: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  created_at: string;
  tags: string[];
  bytes: number;
  type: string;
  etag: string;
  placeholder: boolean;
  url: string;
  secure_url: string;
  folder: string;
  original_filename: string;
  video?: {
    pix_format: string;
    codec: string;
    level: string;
    profile: string;
    bit_rate: string;
    dar: string;
    duration: number;
    fps: number;
    height: number;
    width: number;
  };
}

/**
 * Upload file to Cloudinary
 */
export async function uploadToCloudinary(
  file: File,
  folder: string = 'medpulse',
  resourceType: 'auto' | 'image' | 'video' = 'auto'
): Promise<CloudinaryUploadResponse | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.cloudinary.uploadPreset);
    formData.append('folder', folder);
    formData.append('resource_type', resourceType);

    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data as CloudinaryUploadResponse;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    return null;
  }
}

/**
 * Generate thumbnail for video
 */
export function generateVideoThumbnail(publicId: string): string {
  return `https://res.cloudinary.com/${config.cloudinary.cloudName}/video/upload/c_scale,w_400,f_auto/${publicId}.jpg`;
}

/**
 * Generate optimized image URL
 */
export function getOptimizedImageUrl(
  publicId: string,
  width: number = 800,
  quality: 'auto' | 'best' | 'good' | 'eco' | 'low' = 'auto'
): string {
  return `https://res.cloudinary.com/${config.cloudinary.cloudName}/image/upload/c_scale,w_${width},q_${quality},f_auto/${publicId}`;
}

/**
 * Delete file from Cloudinary
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  try {
    const response = await axios.post(
      `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/resources/image/upload`,
      { public_ids: [publicId] },
      {
        auth: {
          username: config.cloudinary.cloudName,
          password: config.cloudinary.apiKey,
        },
      }
    );

    return response.status === 200;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  maxSizeMB: number = 100,
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'video/mp4']
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (file.size > maxSizeMB * 1024 * 1024) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'File type not allowed',
    };
  }

  return { valid: true };
}
