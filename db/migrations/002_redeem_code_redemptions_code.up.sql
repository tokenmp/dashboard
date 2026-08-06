-- 兑换记录增加码值快照列
--
-- 背景：redeem_code_redemptions 原本只存 redeem_code_id 关联，不存码本身。
-- 兑换记录作为审计凭证应自包含码值（码被删除/改动后仍可追溯），故新增 code 列
-- 存兑换时的码明文快照。历史记录用 redeem_codes.code_plaintext 回填。
--
-- 部署时在业务库执行本脚本（幂等，可重复运行）。

ALTER TABLE redeem_code_redemptions
    ADD COLUMN IF NOT EXISTS code TEXT;

-- 回填历史兑换记录的码值（取对应兑换码的明文）
UPDATE redeem_code_redemptions r
SET code = rc.code_plaintext
FROM redeem_codes rc
WHERE r.redeem_code_id = rc.id
  AND r.code IS NULL;
