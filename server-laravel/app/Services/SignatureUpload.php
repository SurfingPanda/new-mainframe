<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Intervention\Image\ImageManager;

/**
 * E-signature processing — ported from server/src/lib/signature-upload.js.
 * Like avatars, every upload is decoded + re-encoded (validates real image
 * bytes, rejects spoofed/SVG payloads) and normalized to a small WebP.
 * Unlike avatars we keep transparency (a drawn signature is a transparent
 * PNG) and fit it inside a wide banner instead of cropping to a square, so
 * it overlays cleanly on printed documents.
 *
 * Node uses `sharp` (libvips), which also decodes HEIC/AVIF. This host only
 * has the `gd` PHP extension (no `imagick`), and GD has no HEIC/AVIF decoder,
 * so those formats are dropped from the allowlist here — same trade-off as
 * AvatarUpload.
 */
class SignatureUpload
{
    private const MAX_W = 600;
    private const MAX_H = 240;
    public const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

    public const ALLOWED_MIME = [
        'image/png', 'image/jpeg', 'image/webp',
    ];

    /**
     * Decode/validate/trim/resize an uploaded buffer and persist it as a
     * transparent WebP under the 'signatures' disk. Returns the public URL.
     * Throws InvalidImageException if the buffer isn't a decodable image.
     */
    public static function save(string $buffer): string
    {
        try {
            $manager = ImageManager::gd();
            $image = $manager->read($buffer)->orient();

            // Trim away the empty (transparent / uniform) margins so a small
            // mark drawn in a big canvas fills the image — otherwise it prints
            // tiny. Best-effort: a blank/uniform image can make trim throw.
            try {
                $image->trim();
            } catch (\Throwable) {
                // keep the untrimmed image
            }

            // fit inside the banner, never enlarge (sharp's fit:'inside' +
            // withoutEnlargement).
            $image->scaleDown(self::MAX_W, self::MAX_H);

            $encoded = $image->toWebp(quality: 90); // WebP preserves the alpha channel
        } catch (\Throwable $e) {
            throw new InvalidImageException('That file is not a valid image.', previous: $e);
        }

        $filename = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4)) . '.webp';
        Storage::disk('signatures')->put($filename, (string) $encoded);
        return "/uploads/signatures/{$filename}";
    }

    /** Best-effort removal of a previously stored signature file. */
    public static function remove(?string $signatureUrl): void
    {
        if (!$signatureUrl) {
            return;
        }
        Storage::disk('signatures')->delete(basename($signatureUrl));
    }
}
