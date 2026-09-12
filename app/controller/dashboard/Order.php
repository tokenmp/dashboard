<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\Order as OrderModel;
use app\model\User as UserModel;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：订单（orders，dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/orders
 * - GET  /          列表（筛选 user_id / status / kind）
 * - POST /          手工建单（method=manual，直接入账钱包）
 * - POST /:id/refund 退款（只退未消费部分，写 wallet_ledger(refund) 并置 status='refunded'）
 *
 * 现阶段无支付网关（设计文档 §7.2）：手工建单 method='manual'，建单即 status='paid' 并
 * 同事务给钱包入账（kind='topup' 记 topup；bonus_cny>0 另记一行 bonus）。
 * 幂等键沿用 §7.5：`order:{order_id}:credit` / `order:{order_id}:bonus` / `order:{order_id}:refund`。
 *
 * 退款有界（设计文档 §7.4）：必须 wallets.balance_cny >= amount_cny，否则拒绝，
 * 避免「先消费后退款」把余额打成负数。仅退 amount_cny，赠送额度不退。
 */
class Order extends BaseController
{
    /** GET /api/v1/dashboard/orders */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);

        $query = OrderModel::field([
            'id', 'order_no', 'user_id', 'kind', 'amount_cny', 'bonus_cny', 'plan_id',
            'redeem_code_id', 'method', 'status', 'idempotency_key', 'created_at', 'paid_at', 'expires_at',
        ]);

        $userId = trim((string) $this->request->get('user_id', ''));
        if ($userId !== '') {
            $query->where('user_id', $userId);
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        $kind = trim((string) $this->request->get('kind', ''));
        if ($kind !== '') {
            $query->where('kind', $kind);
        }

        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at', 'paid_at'], '-created_at');
        $list = $query->page($page, $size)->select()->toArray();

        return success(Pagination::wrap(array_map(fn ($r) => $this->formatRow($r), $list), $total, $page, $size));
    }

    /**
     * POST /api/v1/dashboard/orders —— 手工建单（ToB/对公），建单即入账
     *
     * body:
     *   user_id          string  用户 ID（必填）
     *   amount_cny       number  充值金额（元，>0，必填）
     *   bonus_cny        number  赠送额度（元，>=0，可选）
     *   idempotency_key  string  可选幂等键（重复提交返回既有订单，不再入账）
     */
    public function create()
    {
        $userId = trim((string) $this->request->post('user_id', ''));
        if ($userId === '') {
            throw new HttpException(400, 'user_id 不能为空');
        }
        if (UserModel::where('id', $userId)->find() === null) {
            throw new HttpException(400, '用户不存在');
        }

        $amount = $this->positiveDecimal('amount_cny');
        $bonus  = $this->nonNegativeDecimal('bonus_cny', 0.0);

        $kind = trim((string) $this->request->post('kind', 'topup'));
        if ($kind !== 'topup') {
            // 购套餐的发放在套餐管理里，这里只处理余额充值，避免半实现的套餐履约
            throw new HttpException(400, '手工建单当前仅支持 kind=topup');
        }

        $clientKey = trim((string) $this->request->post('idempotency_key', ''));
        if (strlen($clientKey) > 160) {
            throw new HttpException(400, 'idempotency_key 不能超过 160 字符');
        }
        $clientKey = $clientKey === '' ? null : $clientKey;

        $orderId = $this->genUuid();
        $orderNo = $this->genOrderNo();
        // 幂等键落库前按用户 scope：orders.idempotency_key 全局唯一，裸 key 会让
        // 两个用户用同一个 key 时后者撞唯一约束（500）或（预检不隔离时）拿到他人订单。
        $orderKey = $clientKey === null ? "manual:{$orderId}" : "manual:{$userId}:{$clientKey}";

        $result = Db::connect('pgsql')->transaction(function () use ($userId, $amount, $bonus, $orderId, $orderNo, $orderKey, $clientKey) {
            $db = Db::connect('pgsql');

            // 幂等：同客户端幂等键的订单已存在 → 原样返回。
            // 必须限定 user_id：orders.idempotency_key 全局唯一，若只按 key 查，
            // 另一用户用过同 key 时会把**他人订单**返回给当前用户（跨用户数据泄漏）。
            if ($clientKey !== null) {
                $dup = $db->query('SELECT id FROM orders WHERE idempotency_key = ? AND user_id = ?::uuid', [$orderKey, $userId]);
                if (!empty($dup)) {
                    return $this->fetchOrder((string) $dup[0]['id']);
                }
            }

            $db->execute(
                "INSERT INTO orders (id, order_no, user_id, kind, amount_cny, bonus_cny, method, status, "
                . "idempotency_key, metadata, created_at, paid_at) "
                . "VALUES (?::uuid, ?, ?::uuid, 'topup', ?, ?, 'manual', 'paid', ?, '{}'::jsonb, NOW(), NOW())",
                [$orderId, $orderNo, $userId, $amount, $bonus, $orderKey]
            );

            // 充值入账（amount）
            $this->creditWallet($userId, $orderId, 'topup', $amount, "order:{$orderId}:credit", '手工建单充值');
            // 赠送额度（bonus）单独记一行
            if ($bonus > 0) {
                $this->creditWallet($userId, $orderId, 'bonus', $bonus, "order:{$orderId}:bonus", '手工建单赠送');
            }

            return $this->fetchOrder($orderId);
        });

        return success($result);
    }

    /** POST /api/v1/dashboard/orders/:id/refund —— 只退未消费部分 */
    public function refund($id)
    {
        $result = Db::connect('pgsql')->transaction(function () use ($id) {
            $db = Db::connect('pgsql');

            $orders = $db->query('SELECT * FROM orders WHERE id = ?::uuid FOR UPDATE', [$id]);
            if (empty($orders)) {
                throw new HttpException(404, '订单不存在');
            }
            $order = $orders[0];

            if ($order['status'] === 'refunded') {
                throw new HttpException(400, '订单已退款');
            }
            if ($order['status'] !== 'paid') {
                throw new HttpException(400, '仅已支付订单可退款');
            }
            // 兑换码订单不可退：码已消费（redeem_code_redemptions UNIQUE 防重兑），
            // 退款会把用户钱包扣走却不恢复码，等于白扣。
            if (($order['method'] ?? null) === 'redeem') {
                throw new HttpException(400, '兑换码订单不可退款（码已消费，不可恢复）');
            }
            // 目前仅支持充值单退款；套餐单需同时回收已发放 user_plans，尚未实现。
            if (($order['kind'] ?? null) !== 'topup') {
                throw new HttpException(400, '仅充值订单可退款（套餐订单退款需回收套餐，暂未开放）');
            }

            $amount = (float) $order['amount_cny'];
            if ($amount <= 0) {
                throw new HttpException(400, '订单金额为 0，无需退款');
            }
            $userId = (string) $order['user_id'];

            // 锁钱包并校验「只退未消费部分」：余额不足以覆盖退款额则拒绝
            $walletRows = $db->query('SELECT balance_cny FROM wallets WHERE user_id = ?::uuid FOR UPDATE', [$userId]);
            if (empty($walletRows)) {
                throw new HttpException(400, '钱包不存在，无法退款');
            }
            if ((float) $walletRows[0]['balance_cny'] < $amount) {
                throw new HttpException(400, '余额不足以退款（仅可退未消费部分）');
            }

            $db->execute(
                'UPDATE wallets SET balance_cny = balance_cny - ?, version = version + 1, updated_at = NOW() '
                . 'WHERE user_id = ?::uuid',
                [$amount, $userId]
            );
            $after = $db->query('SELECT balance_cny FROM wallets WHERE user_id = ?::uuid', [$userId])[0]['balance_cny'];

            $ledgerId = $this->genUuid();
            $db->execute(
                "INSERT INTO wallet_ledger (id, user_id, order_id, entry_type, amount_cny, balance_after, currency, reason, idempotency_key, metadata) "
                . "VALUES (?, ?::uuid, ?::uuid, 'refund', ?, ?, 'CNY', ?, ?, '{}'::jsonb)",
                [$ledgerId, $userId, $id, -$amount, $after, "订单 {$order['order_no']} 退款", "order:{$id}:refund"]
            );

            $db->execute("UPDATE orders SET status = 'refunded' WHERE id = ?::uuid", [$id]);

            return $this->fetchOrder($id);
        });

        return success($result);
    }

    // ─────────────────────────── 内部 ───────────────────────────

    /** 钱包入账（调用方必须已开事务）：原子更新 wallets + 写 wallet_ledger，按幂等键去重 */
    private function creditWallet(string $userId, string $orderId, string $entryType, float $amount, string $idempotencyKey, string $reason): void
    {
        if ($amount <= 0) {
            return;
        }
        $db = Db::connect('pgsql');

        $existing = $db->query('SELECT id FROM wallet_ledger WHERE idempotency_key = ?', [$idempotencyKey]);
        if (!empty($existing)) {
            return; // 已入账，幂等空操作
        }

        // 原子入账：不存在则建行，存在则累加（EXCLUDED.balance_cny = 本次金额）
        $db->execute(
            "INSERT INTO wallets (user_id, balance_cny, frozen_cny, version, currency, created_at, updated_at) "
            . "VALUES (?::uuid, ?, 0, 0, 'CNY', NOW(), NOW()) "
            . "ON CONFLICT (user_id) DO UPDATE SET balance_cny = wallets.balance_cny + EXCLUDED.balance_cny, "
            . "version = wallets.version + 1, updated_at = NOW()",
            [$userId, $amount]
        );

        $after = $db->query('SELECT balance_cny FROM wallets WHERE user_id = ?::uuid', [$userId])[0]['balance_cny'];
        $ledgerId = $this->genUuid();
        $db->execute(
            "INSERT INTO wallet_ledger (id, user_id, order_id, entry_type, amount_cny, balance_after, currency, reason, idempotency_key, metadata) "
            . "VALUES (?, ?::uuid, ?::uuid, ?, ?, ?, 'CNY', ?, ?, '{}'::jsonb)",
            [$ledgerId, $userId, $orderId, $entryType, $amount, $after, $reason, $idempotencyKey]
        );
    }

    /** 读单行订单（含格式归一化；用原生查询，确保事务内可见且与 Db 事务同连接） */
    private function fetchOrder(string $id): array
    {
        $rows = Db::connect('pgsql')->query('SELECT * FROM orders WHERE id = ?::uuid', [$id]);
        if (empty($rows)) {
            throw new HttpException(404, '订单不存在');
        }
        return $this->formatRow($rows[0]);
    }

    /** 金额字段转 float，便于前端直接渲染 */
    private function formatRow(array $row): array
    {
        $row['amount_cny'] = (float) $row['amount_cny'];
        $row['bonus_cny']  = (float) ($row['bonus_cny'] ?? 0);
        return $row;
    }

    /** 必填正数金额 */
    private function positiveDecimal(string $key): float
    {
        $raw = $this->request->post($key);
        if ($raw === null || $raw === '' || !is_numeric($raw)) {
            throw new HttpException(400, "{$key} 必填且为数字");
        }
        $value = round((float) $raw, 8);
        if ($value <= 0) {
            throw new HttpException(400, "{$key} 必须大于 0");
        }
        return $value;
    }

    /** 可空非负金额（缺省用默认值） */
    private function nonNegativeDecimal(string $key, float $default): float
    {
        $raw = $this->request->post($key);
        if ($raw === null || $raw === '') {
            return $default;
        }
        if (!is_numeric($raw)) {
            throw new HttpException(400, "{$key} 须为数字");
        }
        $value = round((float) $raw, 8);
        if ($value < 0) {
            throw new HttpException(400, "{$key} 不能为负");
        }
        return $value;
    }

    /** 对外单号：OD + UTC 时间戳 + 4 字节随机（24 字符，< 64 上限） */
    private function genOrderNo(): string
    {
        return 'OD' . gmdate('YmdHis') . strtoupper(bin2hex(random_bytes(4)));
    }

    /** 预生成 UUID（ThinkPHP pgsql 取回 lastInsId 不可靠） */
    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }
}
