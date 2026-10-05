<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;

/**
 * `php artisan e2e:data seed|cleanup` — test data for the Playwright smoke tests
 * in client/e2e. Seeds three throw-away accounts (admin, plain user, Document
 * Controller) and removes them, plus every work order they filed, afterwards.
 *
 * It runs against the local dev database, so it never touches real data:
 *  - refuses to run when APP_ENV=production;
 *  - everything it creates is identified by the @e2e.test email domain;
 *  - the Document Controller designation (single holder) is taken for the test run
 *    and handed back to whoever held it by `cleanup` (state in storage/app).
 */
class E2eData extends Command
{
    public const PASSWORD = 'E2e-Pass-123!';
    private const DOMAIN = '@e2e.test';

    protected $signature = 'e2e:data {action : seed or cleanup}';
    protected $description = 'Seed or remove the throw-away accounts used by the Playwright e2e tests';

    private function stateFile(): string
    {
        return storage_path('app/e2e-state.json');
    }

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('Refusing to touch data in production.');
            return self::FAILURE;
        }

        return match ($this->argument('action')) {
            'seed' => $this->seed(),
            'cleanup' => $this->cleanup(),
            default => $this->usage(),
        };
    }

    private function usage(): int
    {
        $this->error('Action must be "seed" or "cleanup".');
        return self::FAILURE;
    }

    private function seed(): int
    {
        // Remember who held the Document Controller designation (only on the first
        // seed — a crashed run leaves the file behind and cleanup restores from it).
        if (!File::exists($this->stateFile())) {
            File::put($this->stateFile(), json_encode([
                'document_controllers' => DB::table('users')->where('is_document_controller', 1)
                    ->where('email', 'not like', '%' . self::DOMAIN)->pluck('id')->all(),
            ]));
        }

        DB::table('users')->where('email', 'like', '%' . self::DOMAIN)->delete();
        DB::table('users')->where('is_document_controller', 1)->update(['is_document_controller' => 0]);

        $accounts = [
            ['e2e-admin' . self::DOMAIN, 'E2E Admin', 'admin', 'E2E Admin Dept', 0],
            ['e2e-user' . self::DOMAIN, 'E2E User', 'user', 'E2E User Dept', 0],
            ['e2e-dc' . self::DOMAIN, 'E2E Doc Controller', 'agent', 'E2E Doc Dept', 1],
        ];
        foreach ($accounts as [$email, $name, $role, $dept, $isDc]) {
            DB::table('users')->insert([
                'email' => $email, 'password_hash' => Hash::make(self::PASSWORD), 'name' => $name, 'role' => $role,
                'department' => $dept, 'is_active' => 1, 'is_document_controller' => $isDc, 'token_version' => 0,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $this->info('E2E accounts seeded.');
        return self::SUCCESS;
    }

    private function cleanup(): int
    {
        $users = DB::table('users')->where('email', 'like', '%' . self::DOMAIN)->get(['id', 'email', 'name']);
        $ids = $users->pluck('id')->all();
        $names = $users->pluck('name')->all();
        $identities = array_merge($names, $users->pluck('email')->all());

        if ($identities) {
            $ticketIds = DB::table('tickets')->where(fn ($q) => $q->whereIn('requester', $identities)->orWhereIn('assignee', $identities))->pluck('id')->all();
            if ($ticketIds) {
                DB::table('ticket_activity')->whereIn('ticket_id', $ticketIds)->delete();
                DB::table('ticket_attachments')->whereIn('ticket_id', $ticketIds)->delete();
                DB::table('ticket_watchers')->whereIn('ticket_id', $ticketIds)->delete();
                DB::table('ticket_kb_links')->whereIn('ticket_id', $ticketIds)->delete();
                DB::table('ticket_surveys')->whereIn('ticket_id', $ticketIds)->delete();
                DB::table('tickets')->whereIn('id', $ticketIds)->delete();
            }
        }
        if ($ids) {
            DB::table('messages')->where(fn ($q) => $q->whereIn('recipient_id', $ids)->orWhereIn('sender_id', $ids))->delete();
            DB::table('audit_log')->whereIn('actor_id', $ids)->delete();
            DB::table('users')->whereIn('id', $ids)->delete();
        }

        if (File::exists($this->stateFile())) {
            $state = json_decode(File::get($this->stateFile()), true) ?: [];
            if (!empty($state['document_controllers'])) {
                DB::table('users')->whereIn('id', $state['document_controllers'])->update(['is_document_controller' => 1]);
            }
            File::delete($this->stateFile());
        }
        $this->info('E2E data removed.');
        return self::SUCCESS;
    }
}
