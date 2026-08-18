<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Permissions;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** Ported from server/src/routes/kb.js — the Knowledge Base. */
class KbController extends Controller
{
    private const CATEGORIES = [
        'Accounts', 'Networking', 'Hardware', 'Software',
        'Security', 'Email & Communication', 'Printing & Peripherals',
        'Troubleshooting', 'FAQ', 'Policies', 'General',
    ];

    private const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
    private const MAX_FILE_BYTES = 10 * 1024 * 1024;

    private function slugify(string $text): string
    {
        $s = strtolower($text);
        $s = preg_replace('/[^a-z0-9\s-]/', '', $s);
        $s = trim($s);
        $s = preg_replace('/\s+/', '-', $s);
        return mb_substr($s, 0, 200);
    }

    /** Snapshot the article's content as it stands at $version. Used on create, edit, restore. */
    private function snapshotVersion(int $articleId, int $version, array $params): void
    {
        DB::table('kb_article_versions')->insert([
            'article_id' => $articleId, 'version' => $version,
            'title' => mb_substr((string) $params['title'], 0, 200),
            'category' => $params['category'] ?? null,
            'body' => $params['body'],
            'published' => !empty($params['published']) ? 1 : 0,
            'edited_by' => !empty($params['edited_by']) ? mb_substr((string) $params['edited_by'], 0, 120) : null,
            'change_note' => !empty($params['change_note']) ? mb_substr((string) $params['change_note'], 0, 255) : null,
            'created_at' => now(),
        ]);
    }

    public function index(Request $request)
    {
        $user = $request->authUser();
        $canManage = Permissions::has($user, 'kb', 'manage');

        $query = DB::table('kb_articles as a')
            ->leftJoin('ticket_kb_links as l', 'l.article_id', '=', 'a.id')
            ->select('a.id', 'a.title', 'a.slug', 'a.category', 'a.author', 'a.published', 'a.created_at', 'a.updated_at')
            ->selectRaw('COUNT(l.id) as link_count')
            ->groupBy('a.id', 'a.title', 'a.slug', 'a.category', 'a.author', 'a.published', 'a.created_at', 'a.updated_at');

        $published = $request->query('published');
        if (!$canManage) {
            $query->where('a.published', 1);
        } elseif ($published === '1') {
            $query->where('a.published', 1);
        } elseif ($published === '0') {
            $query->where('a.published', 0);
        }

        $category = $request->query('category');
        if ($category) {
            $query->where('a.category', $category);
        }
        $q = $request->query('q');
        if ($q) {
            $like = "%{$q}%";
            $query->where(fn ($w) => $w->where('a.title', 'like', $like)->orWhere('a.body', 'like', $like));
        }

        return response()->json($query->orderByDesc('a.updated_at')->limit(200)->get());
    }

    public function metaCategories()
    {
        return response()->json(self::CATEGORIES);
    }

    /**
     * Deflection: suggest published articles relevant to a draft work order.
     * Registered before /{slug} so the path isn't shadowed.
     */
    public function suggest(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 3) {
            return response()->json([]);
        }
        $category = trim((string) $request->query('category', ''));

        $tokens = array_values(array_filter(array_map('trim', preg_split('/\s+/', $q)), fn ($t) => mb_strlen($t) >= 3));
        $terms = array_slice($tokens ?: [$q], 0, 6);
        $like = fn ($t) => '%' . addcslashes(strtolower($t), '%_\\') . '%';

        $titleHits = implode(' + ', array_fill(0, count($terms), '(LOWER(a.title) LIKE ?)'));
        $titleParams = array_map($like, $terms);
        $whereOr = implode(' OR ', array_fill(0, count($terms), '(LOWER(a.title) LIKE ? OR LOWER(a.body) LIKE ?)'));
        $whereParams = [];
        foreach ($terms as $t) {
            $whereParams[] = $like($t);
            $whereParams[] = $like($t);
        }

        $orderParts = [];
        $orderParams = [];
        if ($category) {
            $orderParts[] = '(a.category = ?) DESC';
            $orderParams[] = $category;
        }
        $orderParts[] = 'title_hits DESC';
        $orderParts[] = 'helpful_count DESC';
        $orderParts[] = 'a.updated_at DESC';

        $sql = "SELECT a.id, a.title, a.slug, a.category,
              ({$titleHits}) AS title_hits,
              (SELECT COUNT(*) FROM kb_feedback f WHERE f.article_id = a.id AND f.helpful = 1) AS helpful_count
         FROM kb_articles a
        WHERE a.published = 1 AND ({$whereOr})
        ORDER BY " . implode(', ', $orderParts) . ' LIMIT 5';

        return response()->json(DB::select($sql, [...$titleParams, ...$whereParams, ...$orderParams]));
    }

    /** Per-article vote tallies for editors. Registered before /{slug}. */
    public function feedbackReport()
    {
        $rows = DB::table('kb_feedback as f')
            ->join('kb_articles as a', 'a.id', '=', 'f.article_id')
            ->select('a.id', 'a.title', 'a.slug', 'a.category', 'a.published')
            ->selectRaw('SUM(f.helpful = 1) as helpful_count, SUM(f.helpful = 0) as not_helpful_count, COUNT(*) as total')
            ->groupBy('a.id', 'a.title', 'a.slug', 'a.category', 'a.published')
            ->orderByDesc('not_helpful_count')->orderByDesc('total')
            ->get();
        return response()->json($rows);
    }

    public function upload(Request $request)
    {
        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            return response()->json(['error' => 'No file uploaded.'], 400);
        }
        $err = $this->validateUpload($file);
        if ($err) {
            return response()->json(['error' => $err], 400);
        }
        $stored = $this->storeUpload($file);
        return response()->json([
            'url' => "/uploads/kb/{$stored}",
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'isImage' => str_starts_with($file->getClientMimeType(), 'image/'),
        ], 201);
    }

    public function show(Request $request, string $slug)
    {
        $user = $request->authUser();
        $canManage = Permissions::has($user, 'kb', 'manage');

        $query = DB::table('kb_articles as a')
            ->select('a.id', 'a.title', 'a.slug', 'a.category', 'a.body', 'a.author', 'a.published', 'a.created_at', 'a.updated_at')
            ->selectRaw('(SELECT COUNT(*) FROM kb_feedback f WHERE f.article_id = a.id AND f.helpful = 1) as helpful_count')
            ->selectRaw('(SELECT COUNT(*) FROM kb_feedback f WHERE f.article_id = a.id AND f.helpful = 0) as not_helpful_count')
            ->selectRaw('(SELECT f.helpful FROM kb_feedback f WHERE f.article_id = a.id AND f.user_id = ? LIMIT 1) as my_vote', [$user['sub']])
            ->where('a.slug', $slug);
        if (!$canManage) {
            $query->where('a.published', 1);
        }
        $row = $query->first();
        if (!$row) {
            return response()->json(['error' => 'Article not found'], 404);
        }
        return response()->json($row);
    }

    public function tickets(string $slug)
    {
        $rows = DB::table('kb_articles as a')
            ->join('ticket_kb_links as l', 'l.article_id', '=', 'a.id')
            ->join('tickets as t', 't.id', '=', 'l.ticket_id')
            ->select('t.id', 't.title', 't.status', 't.priority', 't.created_at', 'l.created_at as linked_at', 'l.linked_by')
            ->where('a.slug', $slug)
            ->orderByDesc('l.created_at')->limit(100)->get();
        return response()->json($rows);
    }

    public function feedbackStore(Request $request, string $slug)
    {
        $helpful = $request->input('helpful');
        if (!is_bool($helpful)) {
            return response()->json(['error' => 'helpful (boolean) is required'], 400);
        }
        $user = $request->authUser();
        $canManage = Permissions::has($user, 'kb', 'manage');

        $query = DB::table('kb_articles')->select('id')->where('slug', $slug);
        if (!$canManage) {
            $query->where('published', 1);
        }
        $article = $query->first();
        if (!$article) {
            return response()->json(['error' => 'Article not found'], 404);
        }

        $comment = $request->input('comment') ? (mb_substr(trim((string) $request->input('comment')), 0, 1000) ?: null) : null;

        DB::table('kb_feedback')->updateOrInsert(
            ['article_id' => $article->id, 'user_id' => $user['sub']],
            ['helpful' => $helpful ? 1 : 0, 'comment' => $comment, 'updated_at' => now(), 'created_at' => now()]
        );

        $agg = DB::selectOne(
            'SELECT (SELECT COUNT(*) FROM kb_feedback WHERE article_id = ? AND helpful = 1) as helpful_count,
                    (SELECT COUNT(*) FROM kb_feedback WHERE article_id = ? AND helpful = 0) as not_helpful_count',
            [$article->id, $article->id]
        );
        return response()->json(['helpful_count' => $agg->helpful_count, 'not_helpful_count' => $agg->not_helpful_count, 'my_vote' => $helpful ? 1 : 0]);
    }

    public function versionsIndex(string $slug)
    {
        $article = DB::table('kb_articles')->select('id')->where('slug', $slug)->first();
        if (!$article) {
            return response()->json(['error' => 'Article not found'], 404);
        }
        $rows = DB::table('kb_article_versions')->select('version', 'title', 'category', 'published', 'edited_by', 'change_note', 'created_at')
            ->where('article_id', $article->id)->orderByDesc('version')->get();
        return response()->json($rows);
    }

    public function versionShow(string $slug, string $version)
    {
        $version = (int) $version;
        if ($version <= 0) {
            return response()->json(['error' => 'invalid version'], 400);
        }
        $row = DB::table('kb_article_versions as v')
            ->join('kb_articles as a', 'a.id', '=', 'v.article_id')
            ->select('v.version', 'v.title', 'v.category', 'v.body', 'v.published', 'v.edited_by', 'v.change_note', 'v.created_at')
            ->where('a.slug', $slug)->where('v.version', $version)->first();
        if (!$row) {
            return response()->json(['error' => 'Version not found'], 404);
        }
        return response()->json($row);
    }

    public function versionRestore(Request $request, string $slug, string $version)
    {
        $version = (int) $version;
        if ($version <= 0) {
            return response()->json(['error' => 'invalid version'], 400);
        }

        $article = DB::table('kb_articles')->select('id', 'version', 'published')->where('slug', $slug)->first();
        if (!$article) {
            return response()->json(['error' => 'Article not found'], 404);
        }
        $snap = DB::table('kb_article_versions')->select('title', 'category', 'body')
            ->where('article_id', $article->id)->where('version', $version)->first();
        if (!$snap) {
            return response()->json(['error' => 'Version not found'], 404);
        }

        $newVersion = $article->version + 1;
        DB::table('kb_articles')->where('id', $article->id)->update([
            'title' => $snap->title, 'category' => $snap->category, 'body' => $snap->body,
            'version' => $newVersion, 'updated_at' => now(),
        ]);
        $user = $request->authUser();
        $this->snapshotVersion($article->id, $newVersion, [
            'title' => $snap->title, 'category' => $snap->category, 'body' => $snap->body,
            'published' => $article->published, 'edited_by' => $user['name'] ?? $user['email'] ?? null,
            'change_note' => "Restored from v{$version}",
        ]);

        return response()->json(DB::table('kb_articles')->where('id', $article->id)->first());
    }

    public function store(Request $request)
    {
        $title = $request->input('title');
        $body = $request->input('body');
        $category = $request->input('category');
        if (!$title || !$body) {
            return response()->json(['error' => 'title and body are required'], 400);
        }
        if ($category && !in_array($category, self::CATEGORIES, true)) {
            return response()->json(['error' => 'invalid category'], 400);
        }

        $baseSlug = $this->slugify($title);
        $slug = $baseSlug;
        $existing = DB::table('kb_articles')->where('slug', 'like', "{$baseSlug}%")->pluck('slug')->all();
        if ($existing) {
            $taken = array_flip($existing);
            if (isset($taken[$slug])) {
                $i = 2;
                while (isset($taken["{$baseSlug}-{$i}"])) {
                    $i++;
                }
                $slug = "{$baseSlug}-{$i}";
            }
        }

        $author = $request->input('author');
        $published = $request->has('published') ? $request->boolean('published') : true;
        $id = DB::table('kb_articles')->insertGetId([
            'title' => mb_substr(trim((string) $title), 0, 200), 'slug' => $slug,
            'category' => $category ?: null, 'body' => trim((string) $body),
            'author' => $author ? mb_substr(trim((string) $author), 0, 120) : null,
            'published' => $published ? 1 : 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $article = DB::table('kb_articles')->where('id', $id)->first();
        $user = $request->authUser();
        $this->snapshotVersion($id, 1, [
            'title' => $article->title, 'category' => $article->category, 'body' => $article->body,
            'published' => $article->published, 'edited_by' => $user['name'] ?? $user['email'] ?? null,
            'change_note' => 'Initial version',
        ]);
        return response()->json($article, 201);
    }

    public function update(Request $request, string $slug)
    {
        $category = $request->input('category');
        if ($category && !in_array($category, self::CATEGORIES, true)) {
            return response()->json(['error' => 'invalid category'], 400);
        }

        $before = DB::table('kb_articles')->select('id', 'title', 'category', 'body', 'published', 'author', 'version')
            ->where('slug', $slug)->first();
        if (!$before) {
            return response()->json(['error' => 'Article not found'], 404);
        }

        $updates = [];
        if ($request->has('title')) {
            $updates['title'] = mb_substr(trim((string) $request->input('title')), 0, 200);
        }
        if ($request->has('category')) {
            $updates['category'] = $category ?: null;
        }
        if ($request->has('body')) {
            $updates['body'] = trim((string) $request->input('body'));
        }
        if ($request->has('author')) {
            $author = $request->input('author');
            $updates['author'] = $author ? mb_substr(trim((string) $author), 0, 120) : null;
        }
        if ($request->has('published')) {
            $updates['published'] = $request->boolean('published') ? 1 : 0;
        }
        if (!$updates) {
            return response()->json(['error' => 'nothing to update'], 400);
        }

        $updates['updated_at'] = now();
        $affected = DB::table('kb_articles')->where('slug', $slug)->update($updates);
        if (!$affected) {
            return response()->json(['error' => 'Article not found'], 404);
        }

        $after = DB::table('kb_articles')->where('slug', $slug)->first();

        // Snapshot a new version only when content actually changed — a bare
        // publish toggle doesn't warrant a revision.
        $contentChanged = $after->title !== $before->title
            || ($after->category ?? null) !== ($before->category ?? null)
            || $after->body !== $before->body;

        if ($contentChanged) {
            $hasHistory = DB::table('kb_article_versions')->where('article_id', $before->id)->exists();
            if (!$hasHistory) {
                $this->snapshotVersion($before->id, $before->version, [
                    'title' => $before->title, 'category' => $before->category, 'body' => $before->body,
                    'published' => $before->published, 'edited_by' => $before->author ?: 'system', 'change_note' => 'Baseline',
                ]);
            }
            $newVersion = $before->version + 1;
            DB::table('kb_articles')->where('id', $before->id)->update(['version' => $newVersion]);
            $user = $request->authUser();
            $this->snapshotVersion($before->id, $newVersion, [
                'title' => $after->title, 'category' => $after->category, 'body' => $after->body,
                'published' => $after->published, 'edited_by' => $user['name'] ?? $user['email'] ?? null,
                'change_note' => $request->input('change_note'),
            ]);
            $after->version = $newVersion;
        }

        return response()->json($after);
    }

    public function destroy(string $slug)
    {
        $affected = DB::table('kb_articles')->where('slug', $slug)->delete();
        if (!$affected) {
            return response()->json(['error' => 'Article not found'], 404);
        }
        return response()->json(['ok' => true]);
    }

    // --- Attachment serving ------------------------------------------------

    /**
     * Bug fix vs. Node original: lib/upload-access.js has no case for the
     * 'kb' category, so it falls through to "unknown category — default
     * deny" — every /uploads/kb/* request 403s for everyone, including an
     * article's own author, making the upload feature (and any embedded
     * image) unusable in practice. Ported here as "any signed-in user with
     * kb.view", matching the app-wide read gate on the KB feature itself
     * (the same simple rule already used for avatars/signatures).
     */
    public function serveAttachment(Request $request, string $filename)
    {
        $filename = basename($filename);
        $disk = Storage::disk('kb');
        if (!$disk->exists($filename)) {
            return response()->json(['error' => 'Not found'], 404);
        }
        return response($disk->get($filename), 200, [
            'Content-Type' => $disk->mimeType($filename) ?: 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function validateUpload(UploadedFile $file): ?string
    {
        if (!in_array($file->getClientMimeType(), self::ALLOWED_MIME, true)) {
            return "Unsupported file type: {$file->getClientMimeType()}. Allowed: images and PDF.";
        }
        if ($file->getSize() > self::MAX_FILE_BYTES) {
            return 'File is larger than 10 MB.';
        }
        return null;
    }

    private function storeUpload(UploadedFile $file): string
    {
        $safe = mb_substr(preg_replace('/[^a-zA-Z0-9._-]/', '_', $file->getClientOriginalName()), 0, 80);
        $stamp = base_convert((string) round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
        $storedName = "{$stamp}-{$safe}";
        Storage::disk('kb')->putFileAs('', $file, $storedName);
        return $storedName;
    }
}
