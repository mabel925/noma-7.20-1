# Noma 用户等级与额度管理手册

本文档用于管理 Noma 当前的 Free、Seed 和 Pro 用户等级、AI 拍摄额度及物品数量上限。

## 当前等级

| 等级 | AI 物品拍摄额度 | 物品上限 | 用途 |
| --- | ---: | ---: | --- |
| Free | 3 次（生命周期总次数） | 100 | 普通新用户的默认等级 |
| Seed | 20 次（生命周期总次数） | 1,000 | 种子用户和白名单用户 |
| Pro | 不限量 | 10,000 | 预留等级，目前由管理员手动分配 |

一次确认的 AI 物品拍摄只消耗 1 次额度，识图和抠图共用这 1 次。父级、子级地点照片不消耗 AI 额度。同一次拍摄步骤允许重试一次，重试不重复扣费。

达到 AI 额度后，应用使用基础降级处理。达到物品上限后，用户不能新增物品，但已有物品仍可查看、编辑和删除。

## 权限相关表

### `plans`

保存每个等级的统一规则。修改这里会影响该等级下的全部用户。

| 字段 | 含义 |
| --- | --- |
| `code` | 等级代码：`free`、`seed`、`pro`，不要修改 |
| `display_name` | 页面显示的等级名称 |
| `ai_scan_limit` | AI 物品拍摄总额度；`NULL` 表示不限量 |
| `item_limit` | 最大物品数量 |
| `is_assignable` | 是否允许系统自动分配；Pro 当前为 `false` |

### `seed_allowlist`

保存 Seed 白名单邮箱。添加 Seed 用户时主要操作这张表。

| 字段 | 含义 |
| --- | --- |
| `email` | 白名单邮箱 |
| `active` | `true` 表示白名单有效 |
| `note` | 可选备注 |

用户注册前后都可以添加邮箱。已经注册并验证邮箱的用户会升级为 Seed；尚未注册的用户之后使用该邮箱注册时会自动成为 Seed。

### `user_entitlements`

保存每个用户当前属于哪个等级，每个用户只有一行。

| 字段 | 含义 |
| --- | --- |
| `user_id` | 对应 Supabase Authentication 用户 UUID |
| `plan_code` | 当前等级：`free`、`seed` 或 `pro` |
| `ai_scan_limit_override` | 单个用户的 AI 额度覆盖值；`NULL` 表示使用等级默认值 |
| `item_limit_override` | 单个用户的物品上限覆盖值；`NULL` 表示使用等级默认值 |
| `source` | 等级来源：`signup`、`allowlist` 或 `manual` |
| `starts_at` | 权益开始时间 |
| `ends_at` | 预留结束时间，目前尚未启用自动过期 |

普通注册用户由系统自动创建为 Free，Seed 白名单用户由系统自动升级。只有手动分配 Pro 或设置个人特殊额度时才需要直接操作这张表。

### `ai_scan_usage`

记录用户已经进行过的 AI 物品拍摄，是计算已使用次数的依据。同一次物品拍摄的识图和抠图共用一个 `scan_id`，因此只占一次额度。

该表由系统自动维护，不要手动新增、修改或删除记录。

### `ai_credit_grants`

保存额外赠送给单个用户的 AI 次数。额外次数会加在用户等级额度或个人覆盖额度上。

## 其他已有表和视图

| 名称 | 用途 |
| --- | --- |
| `items` | 用户保存的物品数据 |
| `spaces` | 用户保存的父级、子级地点数据 |
| `noma_user_data_summary` | 管理员查看每个用户的数据汇总 |
| `noma_user_data_detail` | 管理员查看用户的物品和地点详情 |

Supabase 左侧带眼睛图标的是视图，用于汇总查看，不是重复保存数据的新表。

## 日常操作速查

1. 修改等级统一额度：操作 `plans`。
2. 添加 Seed 用户：操作 `seed_allowlist`。
3. 手动添加 Pro 用户：运行本文档中的 Pro 分配 SQL。
4. 特殊赠送次数：写入 `ai_credit_grants`。
5. 不要手动修改 `ai_scan_usage`。

## 修改等级统一额度

可以进入 Supabase 的 `Table Editor`，打开 `plans`，找到 `code` 为 `free`、`seed` 或 `pro` 的行，修改 `ai_scan_limit` 或 `item_limit` 后保存。不要修改 `code`。

修改 Free：

```sql
update public.plans
set
  ai_scan_limit = 5,
  item_limit = 200,
  updated_at = now()
where code = 'free';
```

修改 Seed：

```sql
update public.plans
set
  ai_scan_limit = 30,
  item_limit = 1500,
  updated_at = now()
where code = 'seed';
```

修改后立即对该等级全部用户生效，不需要更新前端或重新部署。AI 额度是生命周期总次数，例如用户已使用 8 次，将总额度改为 10 次后只剩 2 次。

降低物品上限不会删除已有物品。如果用户当前物品数已经超过新上限，只会禁止继续新增。

## 添加 Seed 用户

推荐通过 `Table Editor` 操作：

1. 打开 `seed_allowlist`。
2. 点击 `Insert row`。
3. 在 `email` 填写用户注册邮箱。
4. 保持 `active = true`。
5. `note` 可以填写来源，也可以留空。
6. 保存。

批量添加 Seed 用户：

```sql
insert into public.seed_allowlist (email, active, note)
values
  ('user1@example.com', true, '第一批种子用户'),
  ('user2@example.com', true, '第一批种子用户')
on conflict (email) do update
set
  active = true,
  note = excluded.note,
  updated_at = now();
```

Seed 的 20 次是生命周期总额度，不是在 Free 剩余额度上额外增加 20 次。例如用户已经使用 2 次，升级 Seed 后剩余 18 次。

## 移除 Seed 并恢复 Free

仅把 `seed_allowlist.active` 改为 `false` 不会自动降低已经获得 Seed 的用户等级。替换邮箱后运行：

```sql
begin;

update public.seed_allowlist
set active = false, updated_at = now()
where lower(email) = lower('用户邮箱@example.com');

update public.user_entitlements as entitlement
set
  plan_code = 'free',
  ai_scan_limit_override = null,
  item_limit_override = null,
  source = 'manual',
  updated_at = now()
from auth.users as app_user
where entitlement.user_id = app_user.id
  and lower(app_user.email) = lower('用户邮箱@example.com');

commit;
```

## 添加 Pro 用户

Pro 目前没有白名单功能。用户必须先完成注册，然后由管理员按邮箱手动分配：

```sql
insert into public.user_entitlements (user_id, plan_code, source)
select id, 'pro', 'manual'
from auth.users
where lower(email) = lower('用户邮箱@example.com')
on conflict (user_id) do update
set
  plan_code = 'pro',
  ai_scan_limit_override = null,
  item_limit_override = null,
  source = 'manual',
  updated_at = now();
```

当前 Pro 的 AI 额度为不限量，物品上限为 10,000。`is_assignable = false` 表示应用暂不自动售卖或分配 Pro，不影响管理员通过 SQL 手动分配。

检查是否成功：

```sql
select app_user.email, entitlement.plan_code, entitlement.source
from public.user_entitlements as entitlement
join auth.users as app_user on app_user.id = entitlement.user_id
where lower(app_user.email) = lower('用户邮箱@example.com');
```

结果中的 `plan_code` 为 `pro` 即表示成功。

SQL Editor 中保存的 Pro 管理查询只是一段操作脚本。运行成功后可以删除、改名或替换邮箱，不会改变已经写入数据库的用户等级。

## 取消 Pro 并恢复 Free

```sql
update public.user_entitlements as entitlement
set
  plan_code = 'free',
  ai_scan_limit_override = null,
  item_limit_override = null,
  source = 'manual',
  updated_at = now()
from auth.users as app_user
where entitlement.user_id = app_user.id
  and lower(app_user.email) = lower('用户邮箱@example.com');
```

## 给单个用户设置特殊额度

以下示例让指定用户拥有 50 次 AI 总额度和 2,000 个物品上限，同时保留原等级名称：

```sql
update public.user_entitlements as entitlement
set
  ai_scan_limit_override = 50,
  item_limit_override = 2000,
  updated_at = now()
from auth.users as app_user
where entitlement.user_id = app_user.id
  and lower(app_user.email) = lower('用户邮箱@example.com');
```

恢复等级默认额度：

```sql
update public.user_entitlements as entitlement
set
  ai_scan_limit_override = null,
  item_limit_override = null,
  updated_at = now()
from auth.users as app_user
where entitlement.user_id = app_user.id
  and lower(app_user.email) = lower('用户邮箱@example.com');
```

## 额外赠送 AI 次数

以下示例额外赠送 10 次，不改变用户等级：

```sql
insert into public.ai_credit_grants (user_id, amount, reason)
select id, 10, '活动赠送'
from auth.users
where lower(email) = lower('用户邮箱@example.com');
```

## 查看用户等级和使用量

建议在 SQL Editor 中保存一个名为 `Noma 用户等级查看` 的查询：

```sql
with ai_usage as (
  select user_id, count(*)::integer as used
  from public.ai_scan_usage
  group by user_id
),
bonus_credits as (
  select user_id, coalesce(sum(amount), 0)::integer as bonus
  from public.ai_credit_grants
  where expires_at is null or expires_at > now()
  group by user_id
),
item_usage as (
  select user_id::text as user_id, count(*)::integer as item_count
  from public.items
  group by user_id::text
)
select
  app_user.id as user_id,
  coalesce(app_user.raw_user_meta_data ->> 'display_name', split_part(app_user.email, '@', 1)) as username,
  app_user.email,
  entitlement.plan_code,
  plan.display_name as plan_name,
  case
    when coalesce(entitlement.ai_scan_limit_override, plan.ai_scan_limit) is null then null
    else coalesce(entitlement.ai_scan_limit_override, plan.ai_scan_limit) + coalesce(bonus.bonus, 0)
  end as ai_total,
  coalesce(ai.used, 0) as ai_used,
  case
    when coalesce(entitlement.ai_scan_limit_override, plan.ai_scan_limit) is null then null
    else greatest(
      coalesce(entitlement.ai_scan_limit_override, plan.ai_scan_limit)
      + coalesce(bonus.bonus, 0)
      - coalesce(ai.used, 0),
      0
    )
  end as ai_remaining,
  coalesce(item.item_count, 0) as item_count,
  coalesce(entitlement.item_limit_override, plan.item_limit) as item_limit,
  app_user.created_at as registered_at,
  app_user.last_sign_in_at
from public.user_entitlements as entitlement
join auth.users as app_user on app_user.id = entitlement.user_id
join public.plans as plan on plan.code = entitlement.plan_code
left join ai_usage as ai on ai.user_id = entitlement.user_id
left join bonus_credits as bonus on bonus.user_id = entitlement.user_id
left join item_usage as item on item.user_id = entitlement.user_id::text
order by
  case entitlement.plan_code when 'seed' then 1 when 'pro' then 2 else 3 end,
  app_user.created_at desc;
```

`ai_remaining` 显示 `NULL` 表示不限量。

## 注意事项

1. `migrate_access_tiers_v4.sql` 只需要成功运行一次，不要在每次添加用户时重复运行。
2. 不要删除权限相关表。
3. 不要修改或清空 `ai_scan_usage`，否则用户已使用次数会失真。
4. 当前 AI 次数是生命周期总额度，不会每月自动重置。
5. `ends_at` 目前只是预留字段，尚未实现自动到期降级。
6. 单纯修改套餐额度或用户等级不需要更新 GitHub，也不需要重新部署。
7. 如果未来增加月度订阅、支付、自动续费或新等级，应新增下一版数据库迁移，不要修改已经执行过的 v4。
