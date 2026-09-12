<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\User as UserModel;
use app\model\Wallet as WalletModel;
use app\model\WalletLedger;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：用户钱包（wallets / wallet_ledger，dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/users/:userId/wallet
 * - GET  /         余额（可用/冻结/合计）+ 最近资金流水
 * - POST /adjust   管理员手工调账（写 wallet_ledger(entry_type='adjustment') + 原子更新 wallets）
 *
 * 一致性（设计文档 §3.2 / §7.5）：
 * - `balance_cny` 是可用余额，`frozen_cny` 是预扣冻结，总额 = 两者之和；
 * - 每次余额变动必须同事务写一行 wallet_ledger 并记录 balance_after；
 * - 调账必须带 idempotency_key，重复请求返回既有流水（不再二次改余额）；
 * - 调减不得把余额打成负数（wallet_ledger 只有正负方向的记账，约束在 wallets 检查）。
 *
 * 本控制器只做「资金」变更；钱包的请求侧扣费/预留由执行器负责，不在管理面出现。
 */
class Wallet extends BaseController
{
    /** 最近流水默认/最大返回条数 */
    private const LEDGER_DEFAULT_LIMIT = 20;
    private const LEDGER_MAX_LIMIT     = 100;

    /** GET /api/v1/dashboard/users/:userId/wallet */
    public function show($userId)
    {
        $this->assertUserExists((string) $userId);

        $limit = (int) $this->request->get('limit', self::LEDGER_DEFAULT_LIMIT);
        $limit = max(1, min(self::LEDGER_MAX_LIMIT, $limit));

        $wallet = WalletModel::where('user_id', $userId)->find();
        $ledger = WalletLedger::where('user_id', $userId)
            ->order('created_at', 'desc')
            ->limit($limit)
            ->select()
            ->toArray();

        return success([
            'userId' => (string) $userId,
            'wallet' => $this->walletPayload($wallet ? $wallet->toArray() : null),
            'ledger' => array_map(fn ($r) => $this->ledgerPayload($r), $ledger),
        ]);
    }

    /**
     * POST /api/v1/dashboard/users/:userId/wallet/adjust
     *
     * body:
     *   amount_cny       string  调账金额（元），正=增加、负=扣减，不可为 0
     *   idempotency_key  string  幂等键（必填，全局唯一）
     *   reason           string  变动说明（可选）
     */
    public function adjust($userId)
    {
        $userId = (string) $userId;
        $this->assertUserExists($userId);

        $raw = $this->request->post('amount_cny');
        if ($raw === null || $raw === '' || !is_numeric($raw)) {
            throw new HttpException(400, 'amount_cny 必填且为数字');
        }
        $amount = round((float) $raw, 8);
        if ($amount === 0.0) {
            throw new HttpException(400, 'amount_cny 不能为 0');
        }

        $key = trim((string) $this->request->post('idempotency_key', ''));
        if ($key === '') {
            throw new HttpException(400, 'idempotency_key 必填（幂等键，避免重复调账）');
        }
        if (strlen($key) > 160) {
            throw new HttpException(400, 'idempotency_key 不能超过 160 字符');
        }

        $reason = trim((string) $this->request->post('reason', ''));
        if (strlen($reason) > 200) {
            throw new HttpException(400, 'reason 不能超过 200 字符');
        }
        if ($reason === '') {
            $reason = '管理员手工调账';
        }

        // 幂等键按用户 scope 化后再落库：wallet_ledger.idempotency_key 是**全局唯一**，
        // 若直接存调用方给的裸 key，两个用户用同一个 key 时后者必然撞唯一约束（500）。
        // 加 adjust:{user_id}: 前缀后，同一 key 在不同用户下互不干扰，语义与执行器的
        // wallet:{reservation}:{event} 一致。
        $scopedKey = 'adjust:' . $userId . ':' . $key;

        $result = Db::connect('pgsql')->transaction(function () use ($userId, $amount, $scopedKey, $reason) {
            $db = Db::connect('pgsql');

            // 幂等：同 key 的流水已存在 → 直接返回既有记录，不再改余额。
            $existing = $db->query('SELECT * FROM wallet_ledger WHERE idempotency_key = ? AND user_id = ?::uuid', [$scopedKey, $userId]);
            if (!empty($existing)) {
                return [
                    'wallet'     => $this->walletPayload($this->fetchWallet($userId)),
                    'ledger'     => $this->ledgerPayload($existing[0]),
                    'idempotent' => true,
                ];
            }

            // 锁定钱包行（存在则锁住，保证并发调账不互相覆盖）
            $walletRows = $db->query('SELECT balance_cny FROM wallets WHERE user_id = ?::uuid FOR UPDATE', [$userId]);
            if (empty($walletRows) && $amount < 0) {
                throw new HttpException(400, '钱包不存在，无法调减');
            }
            if (!empty($walletRows) && (float) $walletRows[0]['balance_cny'] + $amount < 0) {
                throw new HttpException(400, '余额不足，调减后余额不能为负');
            }

            // 原子入账。调增/调减分两条路径：
            //   - 问题背景：wallets 有 CHECK (balance_cny >= 0)。PostgreSQL 在判定唯一冲突
            //     之前就会用「待插入行」校验 CHECK，因此 INSERT ... ON CONFLICT 里带负数
            //     （EXCLUDED.balance_cny = -30）会直接违反约束报 500，WHERE 守卫轮不到执行。
            //     故调减必须走 UPDATE ... WHERE 余额足够。
            if ($amount > 0) {
                $db->execute(
                    "INSERT INTO wallets (user_id, balance_cny, frozen_cny, version, currency, created_at, updated_at) "
                    . "VALUES (?::uuid, ?, 0, 0, 'CNY', NOW(), NOW()) "
                    . "ON CONFLICT (user_id) DO UPDATE SET balance_cny = wallets.balance_cny + EXCLUDED.balance_cny, "
                    . "version = wallets.version + 1, updated_at = NOW()",
                    [$userId, $amount]
                );
            } else {
                $affected = $db->execute(
                    'UPDATE wallets SET balance_cny = balance_cny + ?, version = version + 1, updated_at = NOW() '
                    . 'WHERE user_id = ?::uuid AND balance_cny + ? >= 0',
                    [$amount, $userId, $amount]
                );
                if ($affected === 0) {
                    // 并发下余额被其它事务改动（上面的 FOR UPDATE 校验已通过但此处再次守卫）
                    throw new HttpException(400, '余额不足，调减后余额不能为负');
                }
            }

            // 读回精确余额作为 balance_after 快照
            $after = $db->query('SELECT balance_cny FROM wallets WHERE user_id = ?::uuid', [$userId])[0]['balance_cny'];

            $ledgerId = $this->genUuid();
            $db->execute(
                "INSERT INTO wallet_ledger (id, user_id, entry_type, amount_cny, balance_after, currency, reason, idempotency_key, metadata) "
                . "VALUES (?, ?::uuid, 'adjustment', ?, ?, 'CNY', ?, ?, '{}'::jsonb)",
                [$ledgerId, $userId, $amount, $after, $reason, $scopedKey]
            );

            return [
                'wallet'     => $this->walletPayload($this->fetchWallet($userId)),
                'ledger'     => $this->ledgerPayload($db->query('SELECT * FROM wallet_ledger WHERE id = ?::uuid', [$ledgerId])[0]),
                'idempotent' => false,
            ];
        });

        return success($result);
    }

    // ─────────────────────────── 内部 ───────────────────────────

    /** 用户必须存在（钱包行可缺省，缺省视为零余额） */
    private function assertUserExists(string $userId): void
    {
        if (UserModel::where('id', $userId)->find() === null) {
            throw new HttpException(404, '用户不存在');
        }
    }

    /** 当前钱包行（可能为 null） */
    private function fetchWallet(string $userId): ?array
    {
        $rows = Db::connect('pgsql')->query(
            'SELECT user_id, balance_cny, frozen_cny, version, currency, created_at, updated_at FROM wallets WHERE user_id = ?::uuid',
            [$userId]
        );
        return $rows[0] ?? null;
    }

    /** 钱包出参：元金额转 float，附带合计 */
    private function walletPayload(?array $row): array
    {
        if ($row === null) {
            return [
                'balance_cny' => 0.0,
                'frozen_cny'  => 0.0,
                'total_cny'   => 0.0,
                'version'     => 0,
                'currency'    => 'CNY',
                'updated_at'  => null,
                'exists'      => false,
            ];
        }
        $balance = (float) $row['balance_cny'];
        $frozen  = (float) $row['frozen_cny'];
        return [
            'balance_cny' => $balance,
            'frozen_cny'  => $frozen,
            'total_cny'   => round($balance + $frozen, 8),
            'version'     => (int) $row['version'],
            'currency'    => (string) $row['currency'],
            'updated_at'  => $row['updated_at'] ?? null,
            'exists'      => true,
        ];
    }

    /** 流水出参：元金额转 float */
    private function ledgerPayload(array $row): array
    {
        return [
            'id'              => (string) $row['id'],
            'user_id'         => (string) $row['user_id'],
            'order_id'        => $row['order_id'] ?? null,
            'request_log_id'  => $row['request_log_id'] ?? null,
            'entry_type'      => (string) $row['entry_type'],
            'amount_cny'      => (float) $row['amount_cny'],
            'balance_after'   => (float) $row['balance_after'],
            'currency'        => (string) $row['currency'],
            'reason'          => $row['reason'] ?? null,
            'idempotency_key' => $row['idempotency_key'] ?? null,
            'created_at'      => $row['created_at'] ?? null,
        ];
    }

    /** 预生成 UUID（ThinkPHP pgsql 取回 lastInsId 不可靠） */
    private function genUuid(): string
    {
        return Db::connect('pgsql')->query('select gen_random_uuid() as id')[0]['id'];
    }
}
