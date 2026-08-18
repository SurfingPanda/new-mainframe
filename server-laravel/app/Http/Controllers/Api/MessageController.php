<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** Ported from server/src/routes/messages.js — internal user-to-user mail (the Mailbox). */
class MessageController extends Controller
{
    private const SUBJECT_MAX = 200;
    private const BODY_MAX = 5000;
    private const MAX_FILE_BYTES = 15 * 1024 * 1024;

    private const ALLOWED_MIME = [
        'application/pdf', 'text/plain', 'text/csv',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    ];

    /** Shape a DB row for the client, framed from the current user's perspective. */
    private function shape(object $row, int $meId): array
    {
        $mine = (int) $row->sender_id === $meId;
        return [
            'id' => $row->id,
            'direction' => $mine ? 'sent' : 'inbox',
            'sender' => ['id' => $row->sender_id, 'name' => $row->sender_name],
            'recipient' => ['id' => $row->recipient_id, 'name' => $row->recipient_name],
            'counterparty' => $mine
                ? ['id' => $row->recipient_id, 'name' => $row->recipient_name]
                : ['id' => $row->sender_id, 'name' => $row->sender_name],
            'subject' => $row->subject,
            'body' => $row->body,
            'link_url' => $row->link_url ?: null,
            'link_label' => $row->link_label ?: null,
            'attachment' => $row->attachment_url ? [
                'url' => $row->attachment_url, 'filename' => $row->attachment_filename,
                'mime' => $row->attachment_mime, 'size' => $row->attachment_size !== null ? (int) $row->attachment_size : null,
            ] : null,
            'is_read' => (bool) $row->is_read,
            'created_at' => $row->created_at,
        ];
    }

    private const SELECT = ['id', 'sender_id', 'sender_name', 'recipient_id', 'recipient_name',
        'subject', 'body', 'link_url', 'link_label',
        'attachment_url', 'attachment_filename', 'attachment_mime', 'attachment_size',
        'is_read', 'created_at'];

    public function index(Request $request)
    {
        $meId = $request->authUser()['sub'];
        $box = $request->query('box') === 'sent' ? 'sent' : 'inbox';

        $query = DB::table('messages')->select(self::SELECT);
        if ($box === 'sent') {
            $query->where('sender_id', $meId)->where('sender_deleted', 0);
        } else {
            $query->where('recipient_id', $meId)->where('recipient_deleted', 0);
        }
        $rows = $query->orderByDesc('created_at')->limit(200)->get();

        return response()->json($rows->map(fn ($r) => $this->shape($r, $meId))->all());
    }

    public function unreadCount(Request $request)
    {
        $meId = $request->authUser()['sub'];
        $count = DB::table('messages')->where('recipient_id', $meId)->where('recipient_deleted', 0)->where('is_read', 0)->count();
        return response()->json(['count' => $count]);
    }

    public function store(Request $request)
    {
        $meId = $request->authUser()['sub'];
        $recipientId = $request->input('recipient_id');
        if (!is_numeric($recipientId) || (int) $recipientId <= 0) {
            return response()->json(['error' => 'recipient_id is required'], 400);
        }
        $recipientId = (int) $recipientId;
        if ($recipientId === $meId) {
            return response()->json(['error' => 'You cannot message yourself'], 400);
        }

        $subject = mb_substr(trim((string) $request->input('subject', '')), 0, self::SUBJECT_MAX);
        $body = trim((string) $request->input('body', ''));

        $file = $request->file('file');
        if ($file && !$file->isValid()) {
            return response()->json(['error' => 'Upload failed'], 400);
        }
        if ($file) {
            $err = $this->validateUpload($file);
            if ($err) {
                return response()->json(['error' => $err], 400);
            }
        }

        if (!$body && !$file) {
            return response()->json(['error' => 'Message body is required'], 400);
        }
        if (mb_strlen($body) > self::BODY_MAX) {
            return response()->json(['error' => 'Message is too long (max ' . self::BODY_MAX . ' characters)'], 400);
        }

        $recipient = DB::table('users')->select('id', 'name')->where('id', $recipientId)->where('is_active', 1)->first();
        if (!$recipient) {
            return response()->json(['error' => 'Recipient not found'], 404);
        }

        $att = ['url' => null, 'name' => null, 'mime' => null, 'size' => null];
        if ($file) {
            $stored = $this->storeUpload($file);
            $att = ['url' => "/uploads/messages/{$stored}", 'name' => $file->getClientOriginalName(), 'mime' => $file->getClientMimeType(), 'size' => $file->getSize()];
        }

        $user = $request->authUser();
        $id = DB::table('messages')->insertGetId([
            'sender_id' => $meId, 'sender_name' => $user['name'] ?? $user['email'],
            'recipient_id' => $recipientId, 'recipient_name' => $recipient->name,
            'subject' => $subject, 'body' => $body,
            'attachment_url' => $att['url'], 'attachment_filename' => $att['name'],
            'attachment_mime' => $att['mime'], 'attachment_size' => $att['size'],
            'created_at' => now(),
        ]);

        $row = DB::table('messages')->select(self::SELECT)->where('id', $id)->first();
        return response()->json($this->shape($row, $meId), 201);
    }

    public function markRead(Request $request, string $id)
    {
        $id = (int) $id;
        $meId = $request->authUser()['sub'];
        DB::table('messages')->where('id', $id)->where('recipient_id', $meId)->where('is_read', 0)
            ->update(['is_read' => 1, 'read_at' => now()]);
        return response()->json(['ok' => true]);
    }

    public function readAll(Request $request)
    {
        $meId = $request->authUser()['sub'];
        DB::table('messages')->where('recipient_id', $meId)->where('recipient_deleted', 0)->where('is_read', 0)
            ->update(['is_read' => 1, 'read_at' => now()]);
        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, string $id)
    {
        $id = (int) $id;
        $meId = $request->authUser()['sub'];

        $row = DB::table('messages')->select('sender_id', 'recipient_id', 'sender_deleted', 'recipient_deleted', 'attachment_url')
            ->where('id', $id)->first();
        if (!$row || ((int) $row->sender_id !== $meId && (int) $row->recipient_id !== $meId)) {
            return response()->json(['error' => 'Message not found'], 404);
        }

        $iAmSender = (int) $row->sender_id === $meId;
        $otherSideDeleted = $iAmSender ? $row->recipient_deleted : $row->sender_deleted;

        if ($otherSideDeleted) {
            DB::table('messages')->where('id', $id)->delete();
            if ($row->attachment_url) {
                Storage::disk('messages')->delete(basename($row->attachment_url));
            }
        } else {
            $col = $iAmSender ? 'sender_deleted' : 'recipient_deleted';
            DB::table('messages')->where('id', $id)->update([$col => 1]);
        }
        return response()->json(['ok' => true]);
    }

    /**
     * Scoped, auth-gated message-attachment serving (sender or recipient
     * only) — a narrow port of the messages branch of lib/upload-access.js.
     */
    public function serveAttachment(Request $request, string $filename)
    {
        $filename = basename($filename);
        $meId = $request->authUser()['sub'];
        $row = DB::table('messages')->select('sender_id', 'recipient_id', 'attachment_filename', 'attachment_mime')
            ->where('attachment_url', "/uploads/messages/{$filename}")->first();
        if (!$row || ((int) $row->sender_id !== $meId && (int) $row->recipient_id !== $meId)) {
            return response()->json(['error' => 'Not found'], 404);
        }

        $disk = Storage::disk('messages');
        if (!$disk->exists($filename)) {
            return response()->json(['error' => 'Not found'], 404);
        }
        return response($disk->get($filename), 200, [
            'Content-Type' => $row->attachment_mime ?: 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . addslashes($row->attachment_filename) . '"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function validateUpload(UploadedFile $file): ?string
    {
        if (!in_array($file->getClientMimeType(), self::ALLOWED_MIME, true)) {
            return "Unsupported file type: {$file->getClientMimeType()}";
        }
        if ($file->getSize() > self::MAX_FILE_BYTES) {
            return 'Attachment is larger than 15 MB.';
        }
        return null;
    }

    private function storeUpload(UploadedFile $file): string
    {
        $safe = mb_substr(preg_replace('/[^a-zA-Z0-9._-]/', '_', $file->getClientOriginalName()), 0, 80);
        $stamp = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
        $storedName = "{$stamp}-{$safe}";
        Storage::disk('messages')->putFileAs('', $file, $storedName);
        return $storedName;
    }
}
