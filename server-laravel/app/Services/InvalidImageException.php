<?php

namespace App\Services;

use RuntimeException;
use Throwable;

/** Thrown by AvatarUpload::save() when the uploaded bytes aren't a decodable image. */
class InvalidImageException extends RuntimeException
{
    public function __construct(string $message, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
