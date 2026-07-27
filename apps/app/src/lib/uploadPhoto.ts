import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { media } from './api';

/**
 * Picks a photo, shrinks it, and uploads it.
 *
 * Resizing happens on the device, before anything leaves it, for three reasons: a modern
 * phone photo is 4–8 MB and would breach the 5 MB limit; uploading it over club wifi at
 * a pitch is slow; and re-encoding through expo-image-manipulator **drops the EXIF
 * block**, which is where the GPS coordinates of someone's location live.
 *
 * That last point is the important one. A member sharing a photo of a partij should not
 * be publishing where they were standing, and stripping it here means the data never
 * reaches the server at all rather than being removed afterwards.
 *
 * The upload itself goes straight to MinIO with a presigned URL; the API only mints the
 * URL and records the result. See ADR-0006.
 */

/** Long edge in pixels. Plenty for a phone or a laptop, far under the size limit. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export type UploadResult = { id: string; moderation_status: string };

export async function pickAndUploadPhoto(caption?: string): Promise<UploadResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Geen toegang tot je fotobibliotheek. Sta dit toe in de instellingen.');
  }

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    // Deliberately no editor: cropping is not the point, and the extra step slows down
    // someone standing at a pitch.
    allowsEditing: false,
    // EXIF is not requested, and the re-encode below discards it regardless.
    exif: false,
  });

  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];

  // Only shrink; never enlarge a small photo into a big file.
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const actions: ImageManipulator.Action[] =
    longEdge > MAX_EDGE
      ? [
          (asset.width ?? 0) >= (asset.height ?? 0)
            ? { resize: { width: MAX_EDGE } }
            : { resize: { height: MAX_EDGE } },
        ]
      : [];

  const processed = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const blob = await (await fetch(processed.uri)).blob();

  const { upload_url, storage_path } = await media.uploadUrl('image/jpeg', blob.size);

  // Straight to storage. The bytes never pass through the API.
  const put = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!put.ok) {
    throw new Error('Uploaden naar de opslag is mislukt. Probeer het opnieuw.');
  }

  // The API inspects the stored object before recording it, so a failure here means the
  // photo is genuinely not accepted rather than merely unreported.
  return media.complete(storage_path, caption ?? null);
}
