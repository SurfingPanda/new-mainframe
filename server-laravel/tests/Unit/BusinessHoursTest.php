<?php

namespace Tests\Unit;

use App\Services\BusinessHours;
use PHPUnit\Framework\TestCase;

/** Mirrors server/test/business-hours.test.js. */
class BusinessHoursTest extends TestCase
{
    private const HOUR = 3_600_000;

    private function week(): array
    {
        $w = ['09:00', '17:00'];
        return ['mon' => [$w], 'tue' => [$w], 'wed' => [$w], 'thu' => [$w], 'fri' => [$w], 'sat' => [], 'sun' => []];
    }

    private function cal(array $holidays = []): array
    {
        return ['timezone' => 'UTC', 'hours' => $this->week(), 'holidays' => $holidays];
    }

    // 2026-06-15 is a Monday (matches the Node suite's fixture date).
    private function u(int $d, int $h, int $mi = 0): int
    {
        return gmmktime($h, $mi, 0, 6, $d, 2026) * 1000;
    }

    public function test_counts_a_sub_window_within_one_business_day(): void
    {
        // Wed 10-12
        $this->assertSame(2 * self::HOUR, BusinessHours::businessMsBetween($this->u(17, 10), $this->u(17, 12), $this->cal()));
    }

    public function test_clips_to_days_open_window(): void
    {
        $this->assertSame(8 * self::HOUR, BusinessHours::businessMsBetween($this->u(17, 8), $this->u(17, 18), $this->cal()));
    }

    public function test_zero_entirely_outside_hours(): void
    {
        $this->assertSame(0, BusinessHours::businessMsBetween($this->u(17, 18), $this->u(17, 20), $this->cal()));
    }

    public function test_skips_weekends(): void
    {
        // Fri 16:00 -> Mon 10:00 = 1h Fri + 1h Mon
        $this->assertSame(2 * self::HOUR, BusinessHours::businessMsBetween($this->u(19, 16), $this->u(22, 10), $this->cal()));
    }

    public function test_excludes_a_holiday(): void
    {
        $this->assertSame(0, BusinessHours::businessMsBetween($this->u(17, 8), $this->u(17, 18), $this->cal(['2026-06-17'])));
    }

    public function test_sums_a_full_week(): void
    {
        $this->assertSame(40 * self::HOUR, BusinessHours::businessMsBetween($this->u(15, 9), $this->u(19, 17), $this->cal()));
    }

    public function test_returns_zero_for_non_positive_interval(): void
    {
        $this->assertSame(0, BusinessHours::businessMsBetween($this->u(17, 12), $this->u(17, 12), $this->cal()));
        $this->assertSame(0, BusinessHours::businessMsBetween($this->u(17, 12), $this->u(17, 10), $this->cal()));
    }

    public function test_business_minutes_between_converts_ms_to_minutes(): void
    {
        $this->assertSame(60.0, BusinessHours::businessMinutesBetween($this->u(17, 10), $this->u(17, 11), $this->cal()));
    }
}
