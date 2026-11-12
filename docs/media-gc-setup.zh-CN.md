# Cloudflare 图片自动清理设置

自动清理仅处理 `media_objects.ref_count = 0` 且 `orphaned_at` 已超过 3 天的 R2 物品图片。任务每天北京时间 03:00 运行，每次最多处理 200 张。R2 删除失败时保留数据库登记，下一次会重试。

地点图片采用不同规则：只要 `spaces.image_url` 仍保存该图片地址，就不会进入清理队列。地点为空或被软删除也不会改变这条保护规则，后续仍可向该地点继续添加物品。

## 1. 确认 Supabase 数据库已就绪

在 Supabase 项目的 SQL Editor 执行：

```sql
select count(*) as eligible_images
from public.media_objects
where ref_count = 0
  and orphaned_at <= now() - interval '3 days';
```

如果提示 `media_objects` 不存在，先执行 `supabase/migrate_user_system_v5.sql`。如果结果是 0，代表当前没有已过 3 天恢复期的待清理图片，这是正常的。

## 2. 添加 Worker Secret

1. 打开 Cloudflare Dashboard，进入 **Workers & Pages**，选择 Worker `noma`。
2. 打开 **Settings → Variables and Secrets**。
3. 新增一个 **Secret**，变量名填 `SUPABASE_SERVICE_ROLE_KEY`。
4. 值从 Supabase 项目的 **Settings → API Keys** 获取，使用服务端 Secret Key（旧版界面叫 `service_role`），不要使用 Publishable/anon key。
5. 保存 Secret。不要把这个值放进前端变量、代码、聊天或 Git。

Worker 已有 `SUPABASE_URL`，无需再添加。若 Worker 的设置里没有该变量，值应为 Supabase 项目 URL。

## 3. 部署绑定与定时任务

仓库的 `wrangler.jsonc` 已配置 R2 绑定 `NOMA_MEMORY_IMAGES → noma-memory-images`，以及每天 UTC 19:00（北京时间 03:00）的 Cron。

部署 `noma` Worker 的新版本后，在 Cloudflare 的 **Settings → Bindings** 确认 R2 Bucket Binding 显示：

- Variable name：`NOMA_MEMORY_IMAGES`
- R2 bucket：`noma-memory-images`

在 **Triggers → Cron Triggers** 确认计划为 `0 19 * * *`。如果项目通过 GitHub 自动部署，按项目原有方式推送并等待 Worker 部署完成；如果使用 Wrangler，请在仓库根目录运行 `npx wrangler deploy`。

## 4. 检查运行结果

Cloudflare Worker 的 **Logs / Observability** 中查找 `[MediaGC]`。正常运行会出现类似日志：

```text
[MediaGC] scanned=0 deleted=0 failed=0 cutoff=...
```

`scanned=0` 表示目前没有达到 3 天期限的孤儿图片，不代表任务失败。若显示 `skipped`，检查 Secret 和 R2 binding；若出现 Supabase HTTP 错误，检查服务端 Secret 是否填对、`media_objects` 是否存在。

## 注意事项

- 删除物品仍是软删除；3 天内恢复时原物品抠图会保留。超过 3 天后再恢复，原抠图可能已经被永久删除。
- 只要 `spaces.image_url` 仍引用地点图片，即使地点为空或已软删除，该图片也不会进入清理条件。
- 这个任务清理 `media_objects` 中已登记的对象；不会按 R2 文件列表推断数据库引用。
- 不要为了测试而手工降低保留时间或直接删除整个 bucket。
