<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Intervention\Image\ImageManager;

/**
 * Profile-picture processing — ported from server/src/lib/avatar-upload.js.
 * Every upload is decoded and re-encoded (validates the bytes are a real
 * image — a spoofed MIME or an SVG/script payload fails to decode and is
 * rejected — and normalizes the result to a small, web-safe WebP).
 *
 * Node uses `sharp` (libvips), which also decodes HEIC/AVIF. This host only
 * has the `gd` PHP extension available (no `imagick` — shared hosting rarely
 * offers it either), and GD has no HEIC/AVIF decoder, so those two formats are
 * dropped from the allowlist here. PNG/JPEG/GIF/WebP — the overwhelming
 * majority of real uploads — are unaffected.
 */
class AvatarUpload
{
    private const SIZE = 256; // square, px
    public const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

    public const ALLOWED_MIME = [
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    ];

    /**
     * Decode/validate/resize an uploaded buffer and persist it as a square
     * WebP under the 'avatars' disk. Returns the public URL. Throws
     * InvalidImageException if the buffer isn't a decodable image.
     */
    public static function save(string $buffer): string
    {
        try {
            $manager = ImageManager::gd();
            $image = $manager->read($buffer)
                ->orient() // honor EXIF orientation before cropping
                ->cover(self::SIZE, self::SIZE, 'center');
            $encoded = $image->toWebp(quality: 82);
        } catch (\Throwable $e) {
            throw new InvalidImageException('That file is not a valid image.', previous: $e);
        }

        $filename = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4)) . '.webp';
        Storage::disk('avatars')->put($filename, (string) $encoded);
        return "/uploads/avatars/{$filename}";
    }

    /** Best-effort removal of a previously stored avatar file. */
    public static function remove(?string $avatarUrl): void
    {
        if (!$avatarUrl) {
            return;
        }
        Storage::disk('avatars')->delete(basename($avatarUrl));
    }
}
