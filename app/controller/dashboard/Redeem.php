<?php
declare(strict_types=1);

namespace app\controller\dashboard;

use app\BaseController;
use app\model\RedeemCode as RedeemCodeModel;
use app\model\RedeemCodeRedemption;
use app\support\Pagination;
use think\exception\HttpException;
use think\facade\Db;

/**
 * 管理面：兑换码管理（dashboard，admin）
 *
 * 路由前缀 /api/v1/dashboard/redeem
 * - GET /codes                  码列表（脱敏 code_hash/code_plaintext）
 * - GET /codes/:id/redemptions  某码兑换记录
 *
 * Admin 中间件已保证角色。
 * 脱敏：永不返回 code_hash / code_plaintext。
 */
class Redeem extends BaseController
{
    /** 码列表字段：去掉 code_hash（哈希永不返回） */
    private const CODE_FIELDS = [
        'id', 'name', 'code_prefix', 'code_suffix', 'code_plaintext',
        'token_amount', 'max_redemptions', 'redeemed_count', 'status',
        'starts_at', 'expires_at', 'override_mode', 'duration_days',
        'coding_plan_id', 'token_plan_id', 'image_plan_id',
        'created_by', 'created_at', 'updated_at',
    ];

    /** 可生成的兑换码明文字符表 */
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    /** 兑换码明文长度 */
    private const CODE_LENGTH = 16;

    /**
     * POST /api/v1/dashboard/redeem/codes
     * 创建一个兑换码（返回创建后的脱敏信息，含明文仅此一次）。
     *
     * body:
     *   name             string  名称（必填）
     *   token_amount     int     充入 token 量（可选，默认 0）
     *   max_redemptions  int     最大兑换次数（默认 1）
     *   starts_at        string  生效时间（可选 ISO）
     *   expires_at       string  过期时间（可选 ISO）
     *   override_mode    string  token 套餐覆盖模式：replace|upgrade_only（默认 replace）
     *   duration_days    int     自定义套餐有效天数（可选）
     *   coding_plan_id   string  奖励 coding 套餐（可选）
     *   token_plan_id    string  奖励 token 套餐（可选）
     *   image_plan_id    string  奖励 image 套餐（可选）
     */
    public function create()
    {
        $name = trim((string) $this->request->post('name', ''));
        if ($name === '') {
            throw new HttpException(400, '名称不能为空');
        }
        if (mb_strlen($name) > 120) {
            throw new HttpException(400, '名称不能超过 120 字符');
        }

        $tokenAmount = (int) ($this->request->post('token_amount', 0) ?? 0);
        if ($tokenAmount < 0) {
            throw new HttpException(400, 'token_amount 不能为负');
        }

        $maxRedemptions = (int) ($this->request->post('max_redemptions', 1) ?? 1);
        if ($maxRedemptions <= 0) {
            throw new HttpException(400, 'max_redemptions 必须大于 0');
        }

        $overrideMode = (string) ($this->request->post('override_mode', 'replace') ?? 'replace');
        if (!in_array($overrideMode, ['replace', 'upgrade_only'], true)) {
            throw new HttpException(400, 'override_mode 非法');
        }

        $durationDays = $this->nullableInt('duration_days');

        // 套餐奖励
        $planIds = [
            'coding' => $this->nullableStr('coding_plan_id'),
            'token'  => $this->nullableStr('token_plan_id'),
            'image'  => $this->nullableStr('image_plan_id'),
        ];

        // 至少要有一种奖励
        if ($tokenAmount <= 0 && $planIds['coding'] === null && $planIds['token'] === null && $planIds['image'] === null) {
            throw new HttpException(400, '至少需要配置一种奖励（token 充值或套餐奖励）');
        }

        // 校验套餐模板存在且 active
        foreach ($planIds as $type => $pid) {
            if ($pid === null) {
                continue;
            }
            $plan = Db::connect('pgsql')->query(
                "SELECT id FROM plans WHERE id = ? AND status = 'active'",
                [$pid]
            );
            if (empty($plan)) {
                throw new HttpException(400, "{$type} 套餐不存在或已下架");
            }
        }

        // 时间解析
        $startsAt  = $this->parseIsoToUtc($this->nullableStr('starts_at'));
        $expiresAt = $this->parseIsoToUtc($this->nullableStr('expires_at'));
        if ($startsAt !== null && $expiresAt !== null && $startsAt >= $expiresAt) {
            throw new HttpException(400, '过期时间必须晚于生效时间');
        }

        // 明文码：优先用管理员自定义的，未提供则随机生成；均需保证全局唯一
        $createdBy = (string) (app('user')->id ?? '');
        $id        = $this->genUuid();
        $plain     = $this->resolveCode();
        $hash      = hash('sha256', $plain);
        [$prefix, $suffix] = $this->codeParts($plain);

        RedeemCodeModel::create([
            'id'              => $id,
            'name'            => $name,
            'code_hash'       => $hash,
            'code_prefix'     => $prefix,
            'code_suffix'     => $suffix,
            'code_plaintext'  => $plain,
            'token_amount'    => $tokenAmount,
            'max_redemptions' => $maxRedemptions,
            'redeemed_count'  => 0,
            'status'          => 'active',
            'starts_at'       => $startsAt,
            'expires_at'      => $expiresAt,
            'override_mode'   => $overrideMode,
            'duration_days'   => $durationDays,
            'coding_plan_id'  => $planIds['coding'],
            'token_plan_id'   => $planIds['token'],
            'image_plan_id'   => $planIds['image'],
            'created_by'      => $createdBy,
        ]);

        // 返回脱敏信息 + 明文（仅此一次，便于管理员分发）
        return success([
            'id'              => $id,
            'name'            => $name,
            'code'            => $plain,
            'code_prefix'     => $prefix,
            'code_suffix'     => $suffix,
            'token_amount'    => $tokenAmount,
            'max_redemptions' => $maxRedemptions,
            'status'          => 'active',
            'starts_at'       => $startsAt,
            'expires_at'      => $expiresAt,
            'override_mode'   => $overrideMode,
            'duration_days'   => $durationDays,
            'coding_plan_id'  => $planIds['coding'],
            'token_plan_id'   => $planIds['token'],
            'image_plan_id'   => $planIds['image'],
            'created_by'      => $createdBy,
        ]);
    }
    /** GET /api/v1/dashboard/redeem/codes */
    public function list()
    {
        [$page, $size] = Pagination::page($this->request);
        $query = RedeemCodeModel::field(self::CODE_FIELDS);

        $keyword = trim((string) $this->request->get('keyword', ''));
        if ($keyword !== '') {
            $query->whereLike('name', "%{$keyword}%");
        }
        $status = trim((string) $this->request->get('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        Pagination::applyTimeRange($query, $this->request, 'created_at');
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success(Pagination::wrap($list, $total, $page, $size));
    }

    /** GET /api/v1/dashboard/redeem/codes/:id/redemptions */
    public function redemptions($id)
    {
        $code = RedeemCodeModel::field(['id', 'name', 'code_prefix', 'code_suffix', 'code_plaintext', 'token_amount', 'max_redemptions', 'redeemed_count', 'status', 'expires_at', 'starts_at'])
            ->where('id', $id)
            ->find();
        if ($code === null) {
            throw new HttpException(404, '兑换码不存在');
        }

        [$page, $size] = Pagination::page($this->request);
        $query = RedeemCodeRedemption::where('redeem_code_id', $id)
            ->with(['user']);
        $total = $query->count();
        Pagination::applySort($query, $this->request, ['created_at'], '-created_at');
        $list = $query->page($page, $size)->select();

        return success([
            'code'       => $code,
            'pagination' => Pagination::wrap($list, $total, $page, $size),
        ]);
    }

    // ==================== 私有辅助 ====================

    /**
     * 解析最终明文码：管理员传了 code 则用自定义码（校验格式 + 全局唯一），
     * 否则随机生成。统一保证返回全局未占用的码。
     */
    private function resolveCode(): string
    {
        $custom = $this->nullableStr('code');
        if ($custom === null) {
            return $this->generateUniqueCode();
        }

        // 格式校验：长度 4-60，仅字母/数字/连字符/下划线
        $len = strlen($custom);
        if ($len < 4 || $len > 60) {
            throw new HttpException(400, '自定义兑换码长度需在 4-60 字符之间');
        }
        if (!preg_match('/^[A-Za-z0-9_\-]+$/', $custom)) {
            throw new HttpException(400, '自定义兑换码仅支持字母、数字、连字符和下划线');
        }

        // 唯一性校验（哈希比对，避免泄露明文）
        $hash   = hash('sha256', $custom);
        $exists = Db::connect('pgsql')->query('SELECT id FROM redeem_codes WHERE code_hash = ?', [$hash]);
        if (!empty($exists)) {
            throw new HttpException(409, '该兑换码已存在，请换一个');
        }

        return $custom;
    }

    /** 生成全局唯一的明文码：带 4-4-4-4 分隔，与已有 code_hash 冲突时重试。 */
    private function generateUniqueCode(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $plain = $this->randomCode();
            $hash  = hash('sha256', $plain);
            $exists = Db::connect('pgsql')->query('SELECT id FROM redeem_codes WHERE code_hash = ?', [$hash]);
            if (empty($exists)) {
                return $plain;
            }
        }
        throw new HttpException(500, '生成唯一兑换码失败，请重试');
    }

    /** 生成单个明文码（带分隔符，如 ABCD-EFGH-JKLM-NPQR）。 */
    private function randomCode(): string
    {
        $size    = strlen(self::CODE_ALPHABET);
        $bytes   = random_bytes(self::CODE_LENGTH);
        $chars   = '';
        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $chars .= self::CODE_ALPHABET[ord($bytes[$i]) % $size];
        }
        return implode('-', str_split($chars, 4));
    }

    /** 脱敏展示用的前缀（首段 + 去分隔符后前 8）与后缀（后 4）。 */
    private function codeParts(string $plain): array
    {
        $compact = str_replace('-', '', $plain);
        return [substr($compact, 0, 8), substr($compact, -4)];
    }

    private function nullableStr(string $key): ?string
    {
        $v = $this->request->post($key);
        if ($v === null) {
            return null;
        }
        $v = trim((string) $v);
        return $v === '' ? null : $v;
    }

    private function nullableInt(string $key): ?int
    {
        $v = $this->request->post($key);
        if ($v === null || $v === '') {
            return null;
        }
        return (int) $v;
    }

    /** 将前端 ISO 字符串解析为 Postgres 可接受的 UTC 'Y-m-d H:i:s'，空或无效返回 null。 */
    private function parseIsoToUtc(?string $iso): ?string
    {
        if ($iso === null || $iso === '') {
            return null;
        }
        $ts = strtotime($iso);
        if ($ts === false) {
            throw new HttpException(400, "时间格式无效：{$iso}");
        }
        return gmdate('Y-m-d H:i:s', $ts);
    }

    private function genUuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
