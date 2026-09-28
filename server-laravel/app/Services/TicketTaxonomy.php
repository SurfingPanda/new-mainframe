<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Admin-editable work-order request types + 3-level category tree
 * (ticket_request_types / ticket_categories — see
 * sql/add-ticket-taxonomy.sql). Replaces the lists that used to be hard-coded
 * in TicketController, Automation, SlaPolicies and the client.
 *
 * Tickets still store plain names (request_type key, category / subcategory /
 * subcategory2), so these tables act as the allowlist + dropdown source.
 * Cached like SlaConfig (file cache, shared across PHP workers) and dropped by
 * forget() on every admin write.
 */
class TicketTaxonomy
{
    /** Used only if the tables can't be read (e.g. pure unit tests with no app). */
    public const DEFAULT_REQUEST_TYPES = ['incident', 'service_request', 'question', 'change'];

    private const CACHE_KEY = 'ticket_taxonomy_cache';

    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /** @return array{types: object[], categories: object[]} every row, sorted */
    private static function all(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, fn () => [
            'types' => DB::table('ticket_request_types')->orderBy('sort_order')->orderBy('id')->get()->all(),
            'categories' => DB::table('ticket_categories')->orderBy('sort_order')->orderBy('id')->get()->all(),
        ]);
    }

    /** @return object[] */
    public static function requestTypes(bool $activeOnly = true): array
    {
        return array_values(array_filter(self::all()['types'], fn ($t) => !$activeOnly || $t->is_active));
    }

    /** @return string[] */
    public static function requestTypeKeys(bool $activeOnly = true): array
    {
        try {
            return array_map(fn ($t) => $t->type_key, self::requestTypes($activeOnly));
        } catch (\Throwable) {
            return self::DEFAULT_REQUEST_TYPES;
        }
    }

    /** @return object[] */
    public static function categoryRows(bool $activeOnly = true): array
    {
        return array_values(array_filter(self::all()['categories'], fn ($c) => !$activeOnly || $c->is_active));
    }

    /** Top-level category names. @return string[] */
    public static function topCategoryNames(bool $activeOnly = true): array
    {
        try {
            return array_values(array_map(
                fn ($c) => $c->name,
                array_filter(self::categoryRows($activeOnly), fn ($c) => (int) $c->parent_id === 0)
            ));
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Nested tree. A child is only included when its parent is (an inactive
     * category hides its whole branch from forms).
     * @return array<int, array{id:int, name:string, is_active:bool, is_system:bool, children:array}>
     */
    public static function tree(bool $activeOnly = true): array
    {
        $byParent = [];
        foreach (self::categoryRows($activeOnly) as $c) {
            $byParent[(int) $c->parent_id][] = $c;
        }
        $build = function (int $parentId) use (&$build, $byParent): array {
            return array_map(fn ($c) => [
                'id' => (int) $c->id,
                'name' => $c->name,
                'is_active' => (bool) $c->is_active,
                'is_system' => (bool) $c->is_system,
                'children' => $build((int) $c->id),
            ], $byParent[$parentId] ?? []);
        };
        return $build(0);
    }

    /**
     * Is $value allowed for $field ('request_type' | 'category')?
     * $activeOnly: new work orders must pick an active entry; edits to an
     * existing one may keep (or re-select) a since-hidden value.
     */
    public static function isAllowed(string $field, ?string $value, bool $activeOnly): bool
    {
        if ($value === null || $value === '') {
            return false;
        }
        $list = match ($field) {
            'request_type' => self::requestTypeKeys($activeOnly),
            'category' => self::topCategoryNames($activeOnly),
            default => [],
        };
        return in_array($value, $list, true);
    }
}
