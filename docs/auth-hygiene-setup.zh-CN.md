# 未验证账号自动清理

Supabase 的邮箱 OTP 登录会在发送验证码时先创建 `auth.users` 记录。用户没有输入验证码时，该记录仍会存在，但不属于已经完成登录的正式用户。

本方案包含两层处理：

- `noma_user_data_summary` 和 `noma_user_data_detail` 只显示邮箱已经验证的正式用户。
- 每天北京时间 03:00，Cloudflare Worker 永久删除创建已超过 24 小时、邮箱从未验证且从未成功登录的账号，每次最多处理 200 个。

## 1. 执行数据库迁移

打开 Supabase 项目的 **SQL Editor**，新建 Query，执行 `supabase/migrate_auth_hygiene_v7.sql` 的完整内容。

迁移可以安全地重复执行。完成后刷新 Table Editor 中的 `noma_user_data_summary`，未验证邮箱应立即不再显示。

可使用以下只读查询确认待清理账号：

```sql
select id, email, created_at, email_confirmed_at, last_sign_in_at
from auth.users
where email is not null
  and email_confirmed_at is null
  and last_sign_in_at is null
order by created_at asc;
```

不要直接通过 SQL 删除 `auth.users`。实际删除由 Worker 使用 Supabase Auth Admin API 完成，以便 Auth 正确清理关联身份数据。

## 2. 部署 Worker

继续复用已经配置的 `SUPABASE_SERVICE_ROLE_KEY` Secret，无需新增密钥。部署新版 Worker 后，现有 Cron `0 19 * * *` 会同时运行图片清理和未验证账号清理；两项任务相互独立，一项失败不会阻止另一项。

## 3. 检查日志

在 Cloudflare Worker 的 **Logs / Observability** 中查找 `[AuthCleanup]`。正常日志类似：

```text
[AuthCleanup] scanned=1 deleted=1 failed=0 cutoff=...
```

- `scanned=0`：没有超过 24 小时的未验证账号。
- `deleted=1`：一个未验证账号已通过 Auth Admin API 永久删除。
- `failed>0`：检查 Worker 的 `SUPABASE_SERVICE_ROLE_KEY` 是否仍有效，并查看同一行错误。

## 安全边界

只有同时满足以下条件的账号才会删除：

1. 邮箱不为空；
2. `email_confirmed_at` 为空；
3. `last_sign_in_at` 为空；
4. `created_at` 已超过 24 小时。

已完成邮箱验证或曾成功登录的账号不会被删除。
