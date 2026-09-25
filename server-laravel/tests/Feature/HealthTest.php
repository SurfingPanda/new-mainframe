<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_reports_db_and_build_stamp_key(): void
    {
        // build.json only exists in a packaged deploy (scripts/package-deploy.mjs);
        // from a checkout the key is present but null.
        $expected = is_file(base_path('build.json'))
            ? json_decode(file_get_contents(base_path('build.json')), true)
            : null;

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('build', $expected);
    }
}
