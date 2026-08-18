<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SpaceAccess;
use App\Services\SpacesHelpers as H;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** Ported from server/src/routes/spaces.js — the Documents tab. */
class SpaceDocController extends Controller
{
    private const DOC_TITLE_MAX = 200;

    private const ALLOWED_MIME = [
        'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    ];
    private const MAX_FILE_BYTES = 25 * 1024 * 1024;

    private function respondSpaceNotFound()
    {
        return response()->json(['error' => 'Space not found'], 404);
    }

    private function shapeDoc(object $row, bool $withBody = true): array
    {
        $out = [
            'id' => $row->id, 'space_id' => $row->space_id, 'title' => $row->title,
            'file_path' => $row->file_path ?? null, 'file_name' => $row->file_name ?? null,
            'mime' => $row->mime ?? null, 'size' => $row->size !== null ? (int) $row->size : null,
            'author_id' => $row->author_id, 'author_name' => $row->author_name,
            'created_at' => $row->created_at, 'updated_at' => $row->updated_at,
        ];
        if ($withBody) {
            $out['body'] = $row->body;
        }
        return $out;
    }

    public function index(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $access = SpaceAccess::load($id, $request->authUser());
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        $rows = DB::table('space_docs')
            ->select('id', 'space_id', 'title', 'file_path', 'file_name', 'mime', 'size', 'author_id', 'author_name', 'created_at', 'updated_at')
            ->where('space_id', $id)->orderByDesc('updated_at')->get();
        return response()->json($rows->map(fn ($r) => $this->shapeDoc($r, false))->all());
    }

    public function show(Request $request, string $id, string $docId)
    {
        $id = H::intId($id);
        $docId = H::intId($docId);
        if (!$id || !$docId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $access = SpaceAccess::load($id, $request->authUser());
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        $doc = DB::table('space_docs')->where('id', $docId)->where('space_id', $id)->first();
        if (!$doc) {
            return response()->json(['error' => 'Document not found'], 404);
        }
        return response()->json($this->shapeDoc($doc));
    }

    public function store(Request $request, string $id)
    {
        $id = H::intId($id);
        if (!$id) {
            return response()->json(['error' => 'invalid space id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can add documents'], 403);
        }
        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'A file is required'], 400);
        }
        $err = $this->validateUpload($file);
        if ($err) {
            return response()->json(['error' => $err], 400);
        }

        $title = mb_substr(trim((string) $request->input('title', '')) ?: $file->getClientOriginalName(), 0, self::DOC_TITLE_MAX);
        $stored = $this->storeUpload($file);
        $filePath = "/uploads/spaces/{$stored}";

        $docId = DB::table('space_docs')->insertGetId([
            'space_id' => $id, 'title' => $title, 'file_path' => $filePath,
            'file_name' => $file->getClientOriginalName(), 'mime' => $file->getClientMimeType(), 'size' => $file->getSize(),
            'author_id' => $user['sub'], 'author_name' => $user['name'], 'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json($this->shapeDoc(DB::table('space_docs')->where('id', $docId)->first()), 201);
    }

    public function update(Request $request, string $id, string $docId)
    {
        $id = H::intId($id);
        $docId = H::intId($docId);
        if (!$id || !$docId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        if (!H::canContribute($access, $user)) {
            return response()->json(['error' => 'Only members can edit documents'], 403);
        }
        $doc = DB::table('space_docs')->select('id')->where('id', $docId)->where('space_id', $id)->first();
        if (!$doc) {
            return response()->json(['error' => 'Document not found'], 404);
        }

        $updates = [];
        if ($request->has('title')) {
            $title = trim((string) $request->input('title'));
            if (!$title) {
                return response()->json(['error' => 'Title is required'], 400);
            }
            if (mb_strlen($title) > self::DOC_TITLE_MAX) {
                return response()->json(['error' => 'Title must be ' . self::DOC_TITLE_MAX . ' characters or fewer'], 400);
            }
            $updates['title'] = $title;
        }
        if ($request->has('body')) {
            $updates['body'] = (string) $request->input('body', '');
        }
        if (!$updates) {
            return response()->json(['error' => 'Nothing to update'], 400);
        }

        $updates['updated_at'] = now();
        DB::table('space_docs')->where('id', $docId)->update($updates);
        return response()->json($this->shapeDoc(DB::table('space_docs')->where('id', $docId)->first()));
    }

    public function destroy(Request $request, string $id, string $docId)
    {
        $id = H::intId($id);
        $docId = H::intId($docId);
        if (!$id || !$docId) {
            return response()->json(['error' => 'invalid id'], 400);
        }
        $user = $request->authUser();
        $access = SpaceAccess::load($id, $user);
        if (!$access) {
            return $this->respondSpaceNotFound();
        }
        $doc = DB::table('space_docs')->select('author_id', 'file_path')->where('id', $docId)->where('space_id', $id)->first();
        if (!$doc) {
            return response()->json(['error' => 'Document not found'], 404);
        }
        if ((int) $doc->author_id !== $user['sub'] && !H::canAdminister($access, $user)) {
            return response()->json(['error' => 'You can only delete your own documents'], 403);
        }

        DB::table('space_docs')->where('id', $docId)->delete();
        if ($doc->file_path) {
            Storage::disk('spaces')->delete(basename($doc->file_path));
        }
        return response()->json(['ok' => true]);
    }

    private function validateUpload(UploadedFile $file): ?string
    {
        if (!in_array($file->getClientMimeType(), self::ALLOWED_MIME, true)) {
            return "Unsupported file type: {$file->getClientMimeType()}";
        }
        if ($file->getSize() > self::MAX_FILE_BYTES) {
            return 'File is larger than 25 MB.';
        }
        return null;
    }

    private function storeUpload(UploadedFile $file): string
    {
        $safe = mb_substr(preg_replace('/[^a-zA-Z0-9._-]/', '_', $file->getClientOriginalName()), 0, 80);
        $stamp = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
        $storedName = "{$stamp}-{$safe}";
        Storage::disk('spaces')->putFileAs('', $file, $storedName);
        return $storedName;
    }
}
