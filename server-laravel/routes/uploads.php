<?php

use App\Http\Controllers\Api\KbController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\SpaceController;
use App\Http\Controllers\Api\TicketController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

// Deliberately NOT under the api.php file (which is auto-prefixed with
// /api) — served at /uploads/... to match the URL shape the Node backend's
// clients already expect (and what this app's own JSON responses embed, e.g.
// ticket_attachments.url). See TicketController::serveAttachment.
Route::get('/uploads/tickets/{filename}', [TicketController::class, 'serveAttachment'])->middleware('auth.jwt');

// Avatars are visible to any signed-in user (per lib/upload-access.js) — no
// per-resource check needed, unlike ticket attachments.
Route::get('/uploads/avatars/{filename}', function (Request $request, string $filename) {
    $filename = basename($filename);
    $disk = Storage::disk('avatars');
    if (!$disk->exists($filename)) {
        return response()->json(['error' => 'Not found'], 404);
    }
    return response($disk->get($filename), 200, [
        'Content-Type' => $disk->mimeType($filename) ?: 'image/webp',
        'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        'X-Content-Type-Options' => 'nosniff',
    ]);
})->middleware('auth.jwt');

// E-signatures, like avatars, are visible to any signed-in user (per
// lib/upload-access.js) — no per-resource check.
Route::get('/uploads/signatures/{filename}', function (Request $request, string $filename) {
    $filename = basename($filename);
    $disk = Storage::disk('signatures');
    if (!$disk->exists($filename)) {
        return response()->json(['error' => 'Not found'], 404);
    }
    return response($disk->get($filename), 200, [
        'Content-Type' => $disk->mimeType($filename) ?: 'image/webp',
        'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        'X-Content-Type-Options' => 'nosniff',
    ]);
})->middleware('auth.jwt');

Route::get('/uploads/messages/{filename}', [MessageController::class, 'serveAttachment'])->middleware('auth.jwt');

// See KbController::serveAttachment docblock for why this fixes a Node bug
// (no 'kb' case in lib/upload-access.js — every KB image 403'd for everyone).
Route::get('/uploads/kb/{filename}', [KbController::class, 'serveAttachment'])->middleware(['auth.jwt', 'permission:kb,view']);

Route::get('/uploads/spaces/{filename}', [SpaceController::class, 'serveAttachment'])->middleware(['auth.jwt', 'permission:spaces,view']);
