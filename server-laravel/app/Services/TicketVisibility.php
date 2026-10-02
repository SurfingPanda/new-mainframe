<?php

namespace App\Services;

/**
 * Pure, DB-free work-order visibility helpers — ported 1:1 from
 * server/src/lib/ticket-visibility.js. The async wrappers that also consult
 * the departments table (canReadTicket / canApprove / canManageTicket) live
 * in DepartmentManagers + TicketController and compose these.
 *
 * $user and $ticket are plain arrays/stdClass-cast-to-array throughout this
 * port (no Eloquent models — see server-laravel/README.md).
 */
class TicketVisibility
{
    public const HR_CONCERNS = 'HR Concerns';
    public const ERP_ACCESS = 'ERP Access';

    public static function isStaff(?array $user): bool
    {
        return ($user['role'] ?? null) === 'admin' || ($user['role'] ?? null) === 'agent';
    }

    /** @return string[] */
    public static function userIdentities(?array $user): array
    {
        return array_values(array_filter([$user['name'] ?? null, $user['email'] ?? null]));
    }

    public static function ownsTicket(array $ticket, array $identities): bool
    {
        return in_array($ticket['requester'] ?? null, $identities, true)
            || in_array($ticket['assignee'] ?? null, $identities, true);
    }

    public static function sameDepartment(?array $user, ?array $ticket): bool
    {
        return !empty($user['department']) && !empty($ticket['department'])
            && $user['department'] === $ticket['department'];
    }

    public static function canViewTicket(?array $user, array $ticket): bool
    {
        return self::isStaff($user)
            || self::ownsTicket($ticket, self::userIdentities($user))
            || self::sameDepartment($user, $ticket);
    }

    /**
     * Sync need-to-know test for an 'HR Concerns' row in a LIST result. $ctx:
     * ['identities' => string[], 'myDept' => ?string, 'managedDepts' => string[]].
     */
    public static function hrConcernVisibleToList(array $row, array $ctx): bool
    {
        if (($row['category'] ?? null) !== self::HR_CONCERNS) {
            return true;
        }
        if (in_array($row['requester'] ?? null, $ctx['identities'], true)
            || in_array($row['assignee'] ?? null, $ctx['identities'], true)) {
            return true;
        }
        if (in_array($row['approval_dept'] ?? null, $ctx['managedDepts'], true)) {
            return true;
        }
        if (!empty($row['department'])) {
            if (!empty($ctx['myDept']) && $row['department'] === $ctx['myDept']) {
                return true;
            }
            if (in_array($row['department'], $ctx['managedDepts'], true)) {
                return true;
            }
        }
        return false;
    }
}
