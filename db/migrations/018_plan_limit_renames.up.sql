-- 套餐限额字段语义化改名（消除历史遗留误导）：
--   monthly_limit    → cycle_limit     它不是"月"限额，而是 cycle_days 计费周期窗内的限额
--                                     （cycle_days=1 即日限额、=7 周限额、=31/空 月限额）
--   hourly_5h_limit  → rolling_5h_limit 它不是按自然小时，而是 NOW()-5h 滚动窗口限额
--
-- weekly_limit（UTC 自然周）与 total_limit（生命周期总量）语义准确，不改。
-- 纯 RENAME：数据与类型不变，索引随列自动跟随。
-- 部署顺序：先构建好引用新列名的 executor + dashboard 镜像，再执行本迁移并立即
-- 重建容器（rename 与容器切换之间的窗口内旧代码查询会报错，需一次性完成）。

ALTER TABLE plans RENAME COLUMN monthly_limit TO cycle_limit;
ALTER TABLE plans RENAME COLUMN hourly_5h_limit TO rolling_5h_limit;
