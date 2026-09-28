<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Audit;
use App\Services\TicketTaxonomy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin-editable work-order request types + category tree (Users → Manage →
 * Categories & Request Types). `index` feeds the create/edit forms for any
 * signed-in user; everything else is users.manage.
 *
 * Tickets store plain names, so:
 *  - renaming a category rewrites existing work orders at that exact path
 *    (and, for top-level categories, SLA policies + automation rules that
 *    reference it); request-type keys never change, only their labels;
 *  - "delete" is only for entries nothing uses — otherwise hide them
 *    (is_active = 0): they vanish from the forms but old work orders keep
 *    their value;
 *  - is_system entries are referenced by name in code (HR Concerns routing,
 *    the ERP / leave special forms, incident + the default request type) and
 *    can't be renamed or deleted (system request types can't be hidden either).
 */
class TaxonomyController extends Controller
{
    private const TOP_NAME_MAX = 50;   // tickets.category is VARCHAR(50)
    private const NAME_MAX = 120;      // tickets.subcategory / subcategory2
    private const LABEL_MAX = 80;
    private const DESC_MAX = 200;
    private const SEP = "\u{1F}";

    // --- Read ----------------------------------------------------------------

    /** Active entries only, names only — what the work-order forms render. */
    public function index()
    {
        $strip = function (array $nodes) use (&$strip): array {
            return array_map(fn ($n) => ['name' => $n['name'], 'children' => $strip($n['children'])], $nodes);
        };
        return response()->json([
            'requestTypes' => array_map(fn ($t) => [
                'key' => $t->type_key, 'label' => $t->label, 'description' => $t->description,
            ], TicketTaxonomy::requestTypes(true)),
            'categories' => $strip(TicketTaxonomy::tree(true)),
        ]);
    }

    /** Everything, including hidden entries, with how many work orders use each. */
    public function manage()
    {
        $typeUsage = DB::table('tickets')->select('request_type', DB::raw('COUNT(*) AS n'))
            ->groupBy('request_type')->pluck('n', 'request_type');

        $usage = [];
        $rows = DB::table('tickets')
            ->select('category', 'subcategory', 'subcategory2', DB::raw('COUNT(*) AS n'))
            ->whereNotNull('category')
            ->groupBy('category', 'subcategory', 'subcategory2')->get();
        foreach ($rows as $r) {
            // Count each work order at every level of its path.
            $path = [];
            foreach ([$r->category, $r->subcategory, $r->subcategory2] as $part) {
                if ($part === null || $part === '') {
                    break;
                }
                $path[] = mb_strtolower($part);
                $key = implode(self::SEP, $path);
                $usage[$key] = ($usage[$key] ?? 0) + (int) $r->n;
            }
        }
        $withUsage = function (array $nodes, array $prefix) use (&$withUsage, $usage): array {
            return array_map(function ($n) use ($withUsage, $usage, $prefix) {
                $path = [...$prefix, mb_strtolower($n['name'])];
                $n['usage'] = $usage[implode(self::SEP, $path)] ?? 0;
                $n['children'] = $withUsage($n['children'], $path);
                return $n;
            }, $nodes);
        };

        return response()->json([
            'requestTypes' => array_map(fn ($t) => [
                'id' => (int) $t->id, 'key' => $t->type_key, 'label' => $t->label,
                'description' => $t->description, 'is_active' => (bool) $t->is_active,
                'is_system' => (bool) $t->is_system, 'usage' => (int) ($typeUsage[$t->type_key] ?? 0),
            ], TicketTaxonomy::requestTypes(false)),
            'categories' => $withUsage(TicketTaxonomy::tree(false), []),
        ]);
    }

    // --- Request types --------------------------------------------------------

    public function storeRequestType(Request $request)
    {
        $label = $this->cleanName($request->input('label'), self::LABEL_MAX);
        if ($label === '') {
            return $this->error('Label is required');
        }
        if (DB::table('ticket_request_types')->where('label', $label)->exists()) {
            return $this->error('A request type with that label already exists', 409);
        }
        $key = $this->uniqueKey($label);
        $id = DB::table('ticket_request_types')->insertGetId([
            'type_key' => $key,
            'label' => $label,
            'description' => $this->cleanDesc($request->input('description')),
            'sort_order' => (int) DB::table('ticket_request_types')->max('sort_order') + 1,
        ]);
        TicketTaxonomy::forget();
        Audit::record($request, [
            'action' => 'taxonomy.request_type.create', 'entityType' => 'request_type',
            'entityId' => $id, 'entityLabel' => $label,
        ]);
        return response()->json(['id' => $id, 'key' => $key], 201);
    }

    public function updateRequestType(Request $request, string $id)
    {
        $row = DB::table('ticket_request_types')->where('id', (int) $id)->first();
        if (!$row) {
            return $this->error('Request type not found', 404);
        }

        $fields = [];
        if ($request->has('label')) {
            $label = $this->cleanName($request->input('label'), self::LABEL_MAX);
            if ($label === '') {
                return $this->error('Label is required');
            }
            if (DB::table('ticket_request_types')->where('label', $label)->where('id', '<>', $row->id)->exists()) {
                return $this->error('A request type with that label already exists', 409);
            }
            $fields['label'] = $label;
        }
        if ($request->has('description')) {
            $fields['description'] = $this->cleanDesc($request->input('description'));
        }
        if ($request->has('is_active')) {
            $active = $request->boolean('is_active');
            if (!$active && $row->is_system) {
                return $this->error("\"{$row->label}\" is used by the system and can't be hidden", 409);
            }
            $fields['is_active'] = $active ? 1 : 0;
        }
        if (!$fields) {
            return $this->error('Nothing to update');
        }

        DB::table('ticket_request_types')->where('id', $row->id)->update($fields);
        TicketTaxonomy::forget();
        Audit::record($request, [
            'action' => 'taxonomy.request_type.update', 'entityType' => 'request_type',
            'entityId' => $row->id, 'entityLabel' => $fields['label'] ?? $row->label,
            'changes' => $this->diff((array) $row, $fields),
        ]);
        return response()->json(['ok' => true]);
    }

    public function destroyRequestType(Request $request, string $id)
    {
        $row = DB::table('ticket_request_types')->where('id', (int) $id)->first();
        if (!$row) {
            return $this->error('Request type not found', 404);
        }
        if ($row->is_system) {
            return $this->error("\"{$row->label}\" is used by the system and can't be deleted", 409);
        }
        $used = DB::table('tickets')->where('request_type', $row->type_key)->count();
        if ($used) {
            return $this->error("Used by {$used} work order(s) — hide it instead so they keep their type", 409);
        }
        if (DB::table('sla_policies')->where('request_type', $row->type_key)->exists()) {
            return $this->error('Used by an SLA policy — change that policy first, or hide this type instead', 409);
        }
        DB::table('ticket_request_types')->where('id', $row->id)->delete();
        TicketTaxonomy::forget();
        Audit::record($request, [
            'action' => 'taxonomy.request_type.delete', 'entityType' => 'request_type',
            'entityId' => $row->id, 'entityLabel' => $row->label,
        ]);
        return response()->json(['ok' => true]);
    }

    // --- Categories ---------------------------------------------------------

    public function storeCategory(Request $request)
    {
        $parentId = (int) $request->input('parent_id', 0);
        $depth = 1;
        if ($parentId) {
            $parent = DB::table('ticket_categories')->where('id', $parentId)->first();
            if (!$parent) {
                return $this->error('Parent category not found', 404);
            }
            if ((int) $parent->depth >= 3) {
                return $this->error('Categories go three levels deep at most');
            }
            $depth = (int) $parent->depth + 1;
        }

        $name = $this->cleanName($request->input('name'), $depth === 1 ? self::TOP_NAME_MAX : self::NAME_MAX);
        if ($name === '') {
            return $this->error('Name is required');
        }
        if (DB::table('ticket_categories')->where('parent_id', $parentId)->where('name', $name)->exists()) {
            return $this->error('That name already exists at this level', 409);
        }

        $id = DB::table('ticket_categories')->insertGetId([
            'parent_id' => $parentId,
            'depth' => $depth,
            'name' => $name,
            'sort_order' => (int) DB::table('ticket_categories')->where('parent_id', $parentId)->max('sort_order') + 1,
        ]);
        TicketTaxonomy::forget();
        Audit::record($request, [
            'action' => 'taxonomy.category.create', 'entityType' => 'category',
            'entityId' => $id, 'entityLabel' => implode(' › ', $this->pathNames($id)),
        ]);
        return response()->json(['id' => $id], 201);
    }

    public function updateCategory(Request $request, string $id)
    {
        $row = DB::table('ticket_categories')->where('id', (int) $id)->first();
        if (!$row) {
            return $this->error('Category not found', 404);
        }

        $fields = [];
        $renamedTo = null;
        if ($request->has('name')) {
            $name = $this->cleanName($request->input('name'), (int) $row->depth === 1 ? self::TOP_NAME_MAX : self::NAME_MAX);
            if ($name === '') {
                return $this->error('Name is required');
            }
            if ($name !== $row->name) {
                if ($row->is_system) {
                    return $this->error("\"{$row->name}\" is used by the system and can't be renamed", 409);
                }
                if (DB::table('ticket_categories')->where('parent_id', $row->parent_id)
                    ->where('name', $name)->where('id', '<>', $row->id)->exists()) {
                    return $this->error('That name already exists at this level', 409);
                }
                $fields['name'] = $name;
                $renamedTo = $name;
            }
        }
        if ($request->has('is_active')) {
            $fields['is_active'] = $request->boolean('is_active') ? 1 : 0;
        }
        if (!$fields) {
            return response()->json(['ok' => true, 'updated_work_orders' => 0]);
        }

        $oldPath = $this->pathNames($row->id);
        $touched = 0;
        DB::transaction(function () use ($row, $fields, $renamedTo, $oldPath, &$touched) {
            DB::table('ticket_categories')->where('id', $row->id)->update($fields);
            if ($renamedTo !== null) {
                $touched = $this->cascadeRename((int) $row->depth, $oldPath, $renamedTo);
            }
        });
        TicketTaxonomy::forget();

        Audit::record($request, [
            'action' => 'taxonomy.category.update', 'entityType' => 'category',
            'entityId' => $row->id, 'entityLabel' => implode(' › ', $oldPath),
            'changes' => $this->diff((array) $row, $fields),
        ]);
        return response()->json(['ok' => true, 'updated_work_orders' => $touched]);
    }

    public function destroyCategory(Request $request, string $id)
    {
        $row = DB::table('ticket_categories')->where('id', (int) $id)->first();
        if (!$row) {
            return $this->error('Category not found', 404);
        }
        if ($row->is_system) {
            return $this->error("\"{$row->name}\" is used by the system and can't be deleted", 409);
        }
        if (DB::table('ticket_categories')->where('parent_id', $row->id)->exists()) {
            return $this->error('Remove or move its sub-entries first, or hide it instead', 409);
        }
        $path = $this->pathNames($row->id);
        $used = $this->pathQuery($path)->count();
        if ($used) {
            return $this->error("Used by {$used} work order(s) — hide it instead so they keep their category", 409);
        }
        if ((int) $row->depth === 1 && DB::table('sla_policies')->where('category', $row->name)->exists()) {
            return $this->error('Used by an SLA policy — change that policy first, or hide this category instead', 409);
        }
        DB::table('ticket_categories')->where('id', $row->id)->delete();
        TicketTaxonomy::forget();
        Audit::record($request, [
            'action' => 'taxonomy.category.delete', 'entityType' => 'category',
            'entityId' => $row->id, 'entityLabel' => implode(' › ', $path),
        ]);
        return response()->json(['ok' => true]);
    }

    /** Body: { kind: 'request_types' | 'categories', ids: [...] } — new order, top to bottom. */
    public function reorder(Request $request)
    {
        $kind = $request->input('kind');
        $ids = array_values(array_unique(array_map('intval', (array) $request->input('ids', []))));
        if (!in_array($kind, ['request_types', 'categories'], true) || !$ids) {
            return $this->error('kind and ids are required');
        }
        $table = $kind === 'request_types' ? 'ticket_request_types' : 'ticket_categories';
        $rows = DB::table($table)->whereIn('id', $ids)->get();
        if ($rows->count() !== count($ids)) {
            return $this->error('Unknown id in list');
        }
        if ($kind === 'categories' && $rows->pluck('parent_id')->unique()->count() > 1) {
            return $this->error('Can only reorder entries that share a parent');
        }
        DB::transaction(function () use ($table, $ids) {
            foreach ($ids as $i => $rowId) {
                DB::table($table)->where('id', $rowId)->update(['sort_order' => $i]);
            }
        });
        TicketTaxonomy::forget();
        return response()->json(['ok' => true]);
    }

    // --- helpers ----------------------------------------------------------------

    /**
     * Rewrite stored names after a rename. Work orders are matched on the full
     * path so e.g. renaming "Email" under one parent leaves same-named entries
     * elsewhere alone. updated_at is preserved so a taxonomy tidy-up doesn't
     * look like activity on every work order.
     */
    private function cascadeRename(int $depth, array $oldPath, string $newName): int
    {
        $column = ['category', 'subcategory', 'subcategory2'][$depth - 1];
        $touched = $this->pathQuery($oldPath)->update([$column => $newName, 'updated_at' => DB::raw('updated_at')]);

        if ($depth === 1) {
            $old = $oldPath[0];
            DB::table('sla_policies')->where('category', $old)->update(['category' => $newName]);
            $this->renameInAutomationRules($old, $newName);
        }
        return $touched;
    }

    /** Point automation conditions (eq/neq/in on category) and set_field category actions at the new name. */
    private function renameInAutomationRules(string $old, string $new): void
    {
        foreach (DB::table('automation_rules')->select('id', 'conditions', 'actions')->get() as $rule) {
            $cond = json_decode((string) $rule->conditions, true);
            $acts = json_decode((string) $rule->actions, true);
            $changed = false;

            foreach ($cond['rules'] ?? [] as $i => $r) {
                if (($r['field'] ?? null) !== 'category') {
                    continue;
                }
                if (is_array($r['value'] ?? null)) {
                    $mapped = array_map(fn ($v) => $v === $old ? $new : $v, $r['value']);
                    if ($mapped !== $r['value']) {
                        $cond['rules'][$i]['value'] = $mapped;
                        $changed = true;
                    }
                } elseif (($r['value'] ?? null) === $old) {
                    $cond['rules'][$i]['value'] = $new;
                    $changed = true;
                }
            }
            foreach (is_array($acts) ? $acts : [] as $i => $a) {
                if (($a['type'] ?? null) === 'set_field' && ($a['field'] ?? null) === 'category' && ($a['value'] ?? null) === $old) {
                    $acts[$i]['value'] = $new;
                    $changed = true;
                }
            }
            if ($changed) {
                DB::table('automation_rules')->where('id', $rule->id)->update([
                    'conditions' => json_encode($cond), 'actions' => json_encode($acts),
                ]);
            }
        }
    }

    /** tickets whose category / subcategory / subcategory2 start with this exact path. */
    private function pathQuery(array $path)
    {
        $q = DB::table('tickets');
        foreach (['category', 'subcategory', 'subcategory2'] as $i => $col) {
            if (!isset($path[$i])) {
                break;
            }
            $q->where($col, $path[$i]);
        }
        return $q;
    }

    /** Names from the top-level category down to this node. @return string[] */
    private function pathNames(int $id): array
    {
        $names = [];
        for ($guard = 0; $id && $guard < 5; $guard++) {
            $row = DB::table('ticket_categories')->select('parent_id', 'name')->where('id', $id)->first();
            if (!$row) {
                break;
            }
            array_unshift($names, $row->name);
            $id = (int) $row->parent_id;
        }
        return $names;
    }

    private function diff(array $before, array $after): array
    {
        $out = [];
        foreach ($after as $k => $v) {
            if (($before[$k] ?? null) != $v) {
                $out[$k] = ['from' => $before[$k] ?? null, 'to' => $v];
            }
        }
        return $out;
    }

    private function error(string $msg, int $status = 400)
    {
        return response()->json(['error' => $msg], $status);
    }

    private function cleanName(mixed $v, int $max): string
    {
        return mb_substr(trim(preg_replace('/\s+/u', ' ', (string) ($v ?? ''))), 0, $max);
    }

    private function cleanDesc(mixed $v): ?string
    {
        $d = mb_substr(trim((string) ($v ?? '')), 0, self::DESC_MAX);
        return $d === '' ? null : $d;
    }

    /** "Hardware Refresh" → "hardware_refresh" (unique; keys are never reused). */
    private function uniqueKey(string $label): string
    {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $label) ?: $label;
        $base = trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($ascii)), '_');
        $base = substr($base !== '' ? $base : 'type', 0, 40);
        $key = $base;
        for ($i = 2; DB::table('ticket_request_types')->where('type_key', $key)->exists(); $i++) {
            $key = "{$base}_{$i}";
        }
        return $key;
    }
}
