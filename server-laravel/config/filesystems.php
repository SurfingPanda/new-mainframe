<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        // Ticket attachments — deliberately under base_path('uploads/tickets'),
        // mirroring server/uploads/tickets/ (the Node backend's convention),
        // not storage/app. Served via a scoped, auth-gated route in
        // routes/api.php (GET /uploads/tickets/{filename}) — not the disk's own
        // public URL, since access must be checked per-ticket like the Node
        // backend's lib/upload-access.js.
        'tickets' => [
            'driver' => 'local',
            'root' => base_path('uploads/tickets'),
            'throw' => false,
            'report' => false,
        ],

        // Profile pictures — served publicly (any signed-in user can see any
        // avatar, per the Node original), so this disk gets a plain unauthenticated
        // route (routes/uploads.php) rather than the ticket disk's per-resource gate.
        'avatars' => [
            'driver' => 'local',
            'root' => base_path('uploads/avatars'),
            'throw' => false,
            'report' => false,
        ],

        // E-signatures — visible to any signed-in user (per lib/upload-access.js,
        // same as avatars), so served via a plain auth-gated route in
        // routes/uploads.php. Transparent WebP, drawn or uploaded on the Profile page.
        'signatures' => [
            'driver' => 'local',
            'root' => base_path('uploads/signatures'),
            'throw' => false,
            'report' => false,
        ],

        // Internal mail (Mailbox) attachments — auth-gated (sender or
        // recipient only), served via a scoped route like the ticket disk.
        'messages' => [
            'driver' => 'local',
            'root' => base_path('uploads/messages'),
            'throw' => false,
            'report' => false,
        ],

        // KB article media (images/PDF embedded inline in markdown bodies).
        // Public to any signed-in user with kb.view, like the Node original's
        // /uploads/kb static mount.
        'kb' => [
            'driver' => 'local',
            'root' => base_path('uploads/kb'),
            'throw' => false,
            'report' => false,
        ],

        // Spaces documents + item-comment attachments. Auth-gated by space
        // membership (or spaces.manage) — see SpaceController::serveAttachment.
        'spaces' => [
            'driver' => 'local',
            'root' => base_path('uploads/spaces'),
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
