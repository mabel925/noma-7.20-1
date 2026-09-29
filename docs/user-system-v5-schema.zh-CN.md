# Noma 用户体系 v5 表关系

## 核心关系

| 表 | 用途 | 主键 | 关键外键 / 关系 | 删除策略 |
| --- | --- | --- | --- | --- |
| `auth.users` | Supabase 身份账号、邮箱和登录会话 | `id` | 被所有用户数据表通过 `user_id` 引用 | 删除账号时级联清理数据库数据 |
| `profiles` | 用户公开资料、唯一用户名、头像和账号状态 | `user_id` | `user_id → auth.users.id`；`normalized_display_name` 全局唯一 | 随账号级联删除 |
| `plans` | Free、Seed、Pro 套餐定义 | `code` | `code ← user_entitlements.plan_code` | 管理配置，不随用户删除 |
| `seed_allowlist` | Seed 用户邮箱白名单 | `email` | 通过规范化邮箱匹配 `auth.users.email` | 管理员显式维护 |
| `user_entitlements` | 用户当前套餐及个人额度覆盖值 | `user_id` | `user_id → auth.users.id`；`plan_code → plans.code` | 随账号级联删除 |
| `ai_credit_grants` | 用户额外获得的 AI 次数 | `id` | `user_id → auth.users.id`；多条记录累加 | 随账号级联删除 |
| `ai_scan_usage` | AI 拍摄流水与重试次数 | `id` | `user_id → auth.users.id`；`(user_id, scan_id)` 唯一 | 随账号级联删除 |
| `spaces` | 父级、子级地点及地点图片 | `id` | `user_id → auth.users.id`；`parent_id → spaces.id` | 软删除，后台延迟清理 |
| `items` | 物品主数据 | `id` | `user_id → auth.users.id`；`space_id → spaces.id` | 软删除，等待后台延迟清理 |
| `media_objects` | R2 对象登记、所有者和引用计数 | `key` | `user_id → auth.users.id`；由 `items/spaces/profiles` 中的媒体 key 引用 | `ref_count=0` 后延迟清理 R2 |

## 关系图

```text
auth.users
├── profiles
├── user_entitlements ─── plans
├── ai_credit_grants
├── ai_scan_usage
├── spaces
│   └── parent_id ─────── spaces.id
├── items
│   └── space_id ─────── spaces.id
└── media_objects ────── Cloudflare R2

seed_allowlist
└── email 匹配 auth.users.email 后影响 user_entitlements

items / spaces / profiles
└── 媒体 key 对应 media_objects.key
```

## 读写规则

| 场景 | v5 规则 |
| --- | --- |
| 列表读取 | 使用 `(updated_at, id)` 游标分页，每页默认 30 条 |
| 新增物品 | 调用 `create_my_item`，不提交完整数组 |
| 编辑物品 | 调用 `update_my_item` 并携带 `expected_version` |
| 删除物品 | 只有 `delete_my_item` 可以删除，实际写入 `deleted_at` |
| 未加载分页 | 不参与差异比较，因此永远不会被误删 |
| 地点维护 | 物品 RPC 在同一数据库事务内创建地点并更新数量 |
| 图片清理 | 仅根据 `media_objects.ref_count` 判断；不接受客户端“完整 key 列表” |
| 权限范围 | RPC 内部使用 `auth.uid()`，不接受客户端指定 `user_id` |

## 部署顺序

1. 在 Supabase SQL Editor 执行 `supabase/migrate_user_system_v5.sql`。
2. 在 Cloudflare Pages/Worker 中配置高强度随机值 `MEDIA_SESSION_SECRET`。
3. 部署前端与 Pages Functions。
4. 使用两个测试账号验证 RLS、分页、并发更新和软删除。
5. 确认稳定后，再启用定时 R2 垃圾清理任务。
