<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Hash Driver
    |--------------------------------------------------------------------------
    */

    'driver' => 'bcrypt',

    /*
    |--------------------------------------------------------------------------
    | Bcrypt Options
    |--------------------------------------------------------------------------
    |
    | 'verify' must stay false (default): every pre-existing user's
    | password_hash was written by Node's bcryptjs, which emits a `$2a$`/
    | `$2b$` prefix — the same bcrypt algorithm, just a different (older)
    | prefix than PHP's own `$2y$`. password_verify() checks these hashes
    | correctly, but Laravel's extra 'verify' => true algoName gate does
    | not recognize them as bcrypt and throws, 500ing every login. See
    | AuthController::login() and README.md.
    |
    */

    'bcrypt' => [
        'rounds' => env('BCRYPT_ROUNDS', 12),
        'verify' => env('HASH_VERIFY', false),
    ],

];
