<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\SearchController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SearchTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('database.default', 'sqlite');
        config()->set('database.connections.sqlite.database', ':memory:');
        DB::purge('sqlite');

        Schema::create('tickets', function (Blueprint $table) {
            $table->increments('id');
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status');
            $table->string('category')->nullable();
            $table->string('requester')->nullable();
            $table->string('assignee')->nullable();
            $table->string('department')->nullable();
            $table->string('approval_dept')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('departments', function (Blueprint $table) {
            $table->string('name');
            $table->integer('manager_id')->nullable();
            $table->boolean('is_hr')->default(false);
        });
        Schema::create('spaces', function (Blueprint $table) {
            $table->increments('id');
            $table->string('name');
            $table->boolean('is_archived')->default(false);
        });
        Schema::create('space_items', function (Blueprint $table) {
            $table->increments('id');
            $table->integer('space_id');
            $table->string('item_key');
            $table->string('title');
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('space_members', function (Blueprint $table) {
            $table->integer('space_id');
            $table->integer('user_id');
            $table->string('role');
        });
        Schema::create('kb_articles', function (Blueprint $table) {
            $table->increments('id');
            $table->string('title');
            $table->text('body');
            $table->string('slug');
            $table->string('category')->nullable();
            $table->boolean('published');
            $table->timestamp('updated_at')->nullable();
        });
        Schema::create('assets', function (Blueprint $table) {
            $table->increments('id');
            $table->string('asset_tag');
            $table->string('type');
            $table->string('model')->nullable();
            $table->string('serial_no')->nullable();
            $table->string('assignee')->nullable();
        });
    }

    public function test_search_returns_matching_work_orders_without_leaking_private_results(): void
    {
        $this->getJson('/api/search?q=over')->assertUnauthorized();

        DB::table('departments')->insert([
            ['name' => 'IT', 'manager_id' => 7, 'is_hr' => 0],
            ['name' => 'HR Department', 'manager_id' => null, 'is_hr' => 1],
        ]);
        DB::table('tickets')->insert([
            ['title' => 'Overdue laptop', 'status' => 'open', 'category' => 'Hardware',
                'requester' => 'Ada', 'department' => null, 'approval_dept' => null],
            ['title' => 'Overdue HR request', 'status' => 'open', 'category' => 'HR Concerns',
                'requester' => 'Ada', 'department' => 'HR Department', 'approval_dept' => 'IT'],
        ]);
        DB::table('spaces')->insert(['id' => 1, 'name' => 'Private Space']);
        DB::table('space_items')->insert(['space_id' => 1, 'item_key' => 'PS-1', 'title' => 'Overdue task']);
        DB::table('space_members')->insert(['space_id' => 1, 'user_id' => 7, 'role' => 'project_owner']);
        DB::table('kb_articles')->insert(['title' => 'Overdue article', 'body' => '', 'slug' => 'overdue', 'published' => 0]);
        DB::table('assets')->insert(['asset_tag' => 'OVER-1', 'type' => 'Laptop', 'assignee' => 'Someone else']);

        $request = Request::create('/api/search', 'GET', ['q' => 'over']);
        $request->attributes->set('auth_user', [
            'sub' => 7, 'name' => 'Ada', 'email' => 'ada@example.com',
            'role' => 'user', 'department' => 'IT',
        ]);

        $results = app(SearchController::class)->index($request)->getData(true);

        $this->assertSame(['Overdue laptop'], array_column($results['tickets'], 'title'));
        $this->assertSame([], $results['spaces']);
        $this->assertSame([], $results['kb']);
        $this->assertSame([], $results['assets']);
        $this->assertSame([], $results['users']);

        DB::table('space_members')->where('space_id', 1)->update(['role' => 'member']);
        DB::table('kb_articles')->where('slug', 'overdue')->update(['published' => 1]);
        DB::table('assets')->where('asset_tag', 'OVER-1')->update(['assignee' => 'Ada']);

        $visible = app(SearchController::class)->index($request)->getData(true);
        $this->assertSame('PS-1', $visible['spaces'][0]['item_key']);
        $this->assertSame('overdue', $visible['kb'][0]['slug']);
        $this->assertSame('OVER-1', $visible['assets'][0]['asset_tag']);

        $request->attributes->set('auth_user', [
            'sub' => 7, 'name' => 'Ada', 'email' => 'ada@example.com',
            'role' => 'agent', 'department' => 'IT',
        ]);
        $staffOutsideHr = app(SearchController::class)->index($request)->getData(true);
        $this->assertSame(['Overdue laptop'], array_column($staffOutsideHr['tickets'], 'title'));

        $request->attributes->set('auth_user', [
            'sub' => 8, 'name' => 'Helen', 'email' => 'helen@example.com',
            'role' => 'user', 'department' => 'HR Department',
        ]);
        $hrMember = app(SearchController::class)->index($request)->getData(true);
        $this->assertEqualsCanonicalizing(['Overdue HR request', 'Overdue laptop'], array_column($hrMember['tickets'], 'title'));
    }
}
