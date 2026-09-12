<?php
declare(strict_types=1);

namespace tests\integration;

use app\controller\dashboard\ModelPrice as ModelPriceController;
use think\exception\HttpException;

/**
 * 管理面定价矩阵控制器集成测试（model_prices C…RUD）。
 *
 * 覆盖 L1（套餐专属价，plan_id 非空）/ L2（平台默认价，plan_id 为空）语义、
 * (plan_id, model_id) 未删除行唯一、上下架、软删与软删后重建、plan_id 哨兵筛选。
 */
final class DashboardModelPriceControllerTest extends IntegrationTestCase
{
    private function controller(): ModelPriceController
    {
        return new ModelPriceController(app());
    }

    /** 断言调用触发指定 HTTP 状态码的 HttpException */
    private function expectHttp(int $code, callable $call, string $needle = ''): void
    {
        $this->expectException(HttpException::class);
        try {
            $call();
        } catch (HttpException $e) {
            $this->assertSame($code, $e->getStatusCode());
            if ($needle !== '') {
                $this->assertStringContainsString($needle, $e->getMessage());
            }
            throw $e;
        }
    }

    /** 发起 create 并返回响应 data */
    private function create(array $post): array
    {
        $this->postRequest($post);
        return $this->body($this->controller()->create())['data'];
    }

    private function dbStatus(string $id): string
    {
        return (string) $this->rows('SELECT status FROM model_prices WHERE id = ?::uuid', [$id])[0]['status'];
    }

    /* ------------------------------ create ------------------------------ */

    public function testCreateL1PlanScopedPrice(): void
    {
        $plan  = $this->seedPlan(['plan_type' => 'coding']);
        $model = $this->seedModel();

        $data = $this->create([
            'plan_id' => $plan, 'model_id' => $model, 'request_weight' => 2.5, 'status' => 'active',
        ]);

        $this->assertSame($plan, $data['plan_id']);
        $this->assertSame($model, $data['model_id']);
        $this->assertSame(2.5, $data['request_weight']);
        $this->assertSame('active', $data['status']);
        $this->assertSame('CNY', $data['currency']);
    }

    public function testCreateL2PlatformDefaultPrice(): void
    {
        $model = $this->seedModel();

        $data = $this->create([
            'plan_id' => '', 'model_id' => $model,
            'input_price_per_token' => 0.000001, 'output_price_per_token' => 0.000002,
        ]);

        $this->assertNull($data['plan_id']);
        $this->assertSame(0.000001, $data['input_price_per_token']);
        $this->assertSame(0.000002, $data['output_price_per_token']);
    }

    public function testCreateDuplicatePlanModelReturns409(): void
    {
        $plan  = $this->seedPlan(['plan_type' => 'token']);
        $model = $this->seedModel();
        $this->create(['model_id' => $model, 'plan_id' => $plan, 'input_price_per_token' => 0.1]);

        $this->postRequest(['model_id' => $model, 'plan_id' => $plan, 'input_price_per_token' => 0.2]);
        $this->expectHttp(409, fn () => $this->controller()->create(), '已存在');
        $this->assertSame(1, (int) $this->rows('SELECT count(*) as c FROM model_prices')[0]['c']);
    }

    public function testCreateRejectsUnknownModel(): void
    {
        $this->postRequest(['model_id' => $this->uuid(), 'plan_id' => '']);
        $this->expectHttp(400, fn () => $this->controller()->create(), '模型不存在');
    }

    public function testCreateRejectsUnknownPlan(): void
    {
        $model = $this->seedModel();
        $this->postRequest(['model_id' => $model, 'plan_id' => $this->uuid()]);
        $this->expectHttp(400, fn () => $this->controller()->create(), '套餐不存在');
    }

    public function testCreateRejectsNegativeNumbers(): void
    {
        $model = $this->seedModel();
        $this->postRequest(['model_id' => $model, 'plan_id' => '', 'request_weight' => -1]);
        $this->expectHttp(400, fn () => $this->controller()->create(), 'request_weight 不能为负');

        $this->postRequest(['model_id' => $model, 'plan_id' => '', 'input_price_per_token' => -0.5]);
        $this->expectHttp(400, fn () => $this->controller()->create(), 'input_price_per_token 不能为负');
    }

    public function testCreateRejectsIllegalStatus(): void
    {
        $model = $this->seedModel();
        $this->postRequest(['model_id' => $model, 'plan_id' => '', 'status' => 'deleted']);
        $this->expectHttp(400, fn () => $this->controller()->create(), 'status 非法');
    }

    /* ------------------------------ update ------------------------------ */

    public function testUpdateMissingReturns404(): void
    {
        $model = $this->seedModel();
        $this->postRequest(['model_id' => $model, 'plan_id' => '', 'request_weight' => 1]);
        $this->expectHttp(404, fn () => $this->controller()->update($this->uuid()), '不存在');
    }

    public function testUpdateSuccess(): void
    {
        $model = $this->seedModel();
        $id    = $this->create(['model_id' => $model, 'plan_id' => '', 'request_weight' => 1])['id'];

        $this->postRequest(['model_id' => $model, 'plan_id' => '', 'request_weight' => 3, 'input_price_per_token' => 0.25]);
        $data = $this->body($this->controller()->update($id))['data'];

        $this->assertSame(3.0, $data['request_weight']);
        $this->assertSame(0.25, $data['input_price_per_token']);
    }

    public function testUpdateDoesNotConflictWithItself(): void
    {
        $plan  = $this->seedPlan(['plan_type' => 'coding']);
        $model = $this->seedModel();
        $id    = $this->create(['model_id' => $model, 'plan_id' => $plan, 'request_weight' => 1])['id'];

        // 改自己（plan_id/model_id 不变）不应被唯一性检查判为冲突
        $this->postRequest(['model_id' => $model, 'plan_id' => $plan, 'request_weight' => 2]);
        $data = $this->body($this->controller()->update($id))['data'];

        $this->assertSame($id, $data['id']);
        $this->assertSame(2.0, $data['request_weight']);
    }

    /* --------------------------- updateStatus --------------------------- */

    public function testUpdateStatusToggles(): void
    {
        $model = $this->seedModel();
        $id    = $this->create(['model_id' => $model, 'plan_id' => '', 'request_weight' => 1])['id'];

        $this->postRequest(['status' => 'disabled']);
        $this->assertSame('disabled', $this->body($this->controller()->updateStatus($id))['data']['status']);
        $this->assertSame('disabled', $this->dbStatus($id));

        $this->postRequest(['status' => 'active']);
        $this->assertSame('active', $this->body($this->controller()->updateStatus($id))['data']['status']);
        $this->assertSame('active', $this->dbStatus($id));
    }

    public function testUpdateStatusRejectsIllegalStatus(): void
    {
        $model = $this->seedModel();
        $id    = $this->create(['model_id' => $model, 'plan_id' => '', 'request_weight' => 1])['id'];

        $this->postRequest(['status' => 'deleted']);
        $this->expectHttp(400, fn () => $this->controller()->updateStatus($id), 'status 非法');
        $this->assertSame('active', $this->dbStatus($id));
    }

    /* ------------------------------ delete ------------------------------ */

    public function testDeleteSoftDeletesAndAllowsRecreate(): void
    {
        $plan  = $this->seedPlan(['plan_type' => 'coding']);
        $model = $this->seedModel();
        $id    = $this->create(['model_id' => $model, 'plan_id' => $plan, 'request_weight' => 1])['id'];

        $this->postRequest([]);
        $this->body($this->controller()->delete($id));
        $this->assertSame('deleted', $this->dbStatus($id));
        // 软删仍保留物理行
        $this->assertSame(1, (int) $this->rows('SELECT count(*) as c FROM model_prices')[0]['c']);

        // 软删后同一 (plan_id, model_id) 可再次创建（partial unique index 只约束未删除行）
        $again = $this->create(['model_id' => $model, 'plan_id' => $plan, 'request_weight' => 2]);
        $this->assertNotSame($id, $again['id']);
        $this->assertSame('active', $again['status']);
    }

    /* ------------------------------- list ------------------------------- */

    public function testListPlanIdSentinelsReturnPlatformDefault(): void
    {
        $plan  = $this->seedPlan(['plan_type' => 'coding']);
        $model = $this->seedModel();
        $this->create(['model_id' => $model, 'plan_id' => $plan, 'request_weight' => 5]);
        $l2 = $this->create(['model_id' => $model, 'plan_id' => '', 'request_weight' => 1]);

        foreach (['null', 'none', 'platform', 'default', 'NONE'] as $sentinel) {
            $this->getRequest(['plan_id' => $sentinel]);
            $body = $this->body($this->controller()->list())['data'];
            $this->assertSame(1, $body['total'], "plan_id={$sentinel} 应只返回平台默认价");
            $this->assertNull($body['list'][0]['plan_id']);
            $this->assertSame($l2['id'], $body['list'][0]['id']);
        }

        // 空/缺省 = 不筛选（与其它 list 端点一致）
        $this->getRequest([]);
        $this->assertSame(2, $this->body($this->controller()->list())['data']['total']);
    }

    public function testListExcludesDeleted(): void
    {
        $model = $this->seedModel();
        $keep  = $this->create(['model_id' => $model, 'plan_id' => '', 'request_weight' => 1])['id'];
        $gone  = $this->create(['model_id' => $this->seedModel(), 'plan_id' => '', 'request_weight' => 1])['id'];
        $this->seedModelPrice(null, $this->seedModel(), null, null, 'deleted');

        $this->postRequest([]);
        $this->body($this->controller()->delete($gone));

        $this->getRequest([]);
        $body = $this->body($this->controller()->list())['data'];
        $ids  = array_column($body['list'], 'id');

        $this->assertContains($keep, $ids);
        $this->assertNotContains($gone, $ids);
        $this->assertSame(1, $body['total']);
    }
}
