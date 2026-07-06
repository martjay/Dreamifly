# TODO

## 2026-07-06 接口性能优化前基线

状态：基线已记录，优化未实现

记录目的：
- 记录当前主要只读接口耗时，后续进行认证缓存、首屏用户态聚合、动态 token、配置缓存和 N+1 优化后，用同一方法复测对比。
- 当前测试和生产共用同一个数据库，本文只记录观测结果，不包含数据库变更方案。

采样条件：
- 本地基线：`http://localhost:3000`，已有服务正在运行，本次未启动项目。
- 线上参考：`https://dreamifly.com`。
- 方法：只读 `GET` 请求；每个接口先 warm-up 1 次，本地记录 5 次，线上记录 3 次。
- 请求头：`Cache-Control: no-cache`。
- 账号状态：未携带登录 Cookie，未测试真实登录用户、订阅用户、管理员用户接口耗时。
- 范围限制：未执行 `POST`、未触发生成、支付、CDK 兑换、批量操作或任何写入行为；未连接数据库执行 `EXPLAIN`。
- 统计口径：单位为毫秒，`p95` 由于样本少，只作为粗略尾部参考。

本地接口基线：

| 接口 | 状态 | 样本 | p50 | p95 | avg | max | 说明 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /api/time` | 200 | 5 | 9.5 | 11.2 | 9.9 | 11.2 | 动态 token 时间源 |
| `GET /api/models` | 200 | 5 | 9.7 | 11.8 | 10.0 | 11.8 | 创建页模型列表 |
| `GET /api/video-models` | 200 | 5 | 9.8 | 10.1 | 9.8 | 10.1 | 视频模型列表 |
| `GET /api/workflows` | 200 | 5 | 9.2 | 10.1 | 9.2 | 10.1 | 工作流列表 |
| `GET /api/stats` | 200 | 5 | 47.9 | 95.4 | 54.5 | 95.4 | 站点统计 |
| `GET /api/community/tags` | 200 | 5 | 106.4 | 182.9 | 128.7 | 182.9 | 社区标签 |
| `GET /api/community/feed?page=1&pageSize=20` | 200 | 5 | 223.7 | 287.9 | 240.9 | 287.9 | 社区首屏列表 |
| `GET /api/points/packages` | 200 | 5 | 44.8 | 110.4 | 58.4 | 110.4 | 积分套餐 |
| `GET /api/subscription/plans` | 200 | 5 | 113.9 | 125.9 | 104.7 | 125.9 | 订阅套餐 |
| `GET /api/points/balance` | 401 | 5 | 9.0 | 10.2 | 9.1 | 10.2 | 未登录积分接口，只能反映未登录拒绝路径 |
| `GET /api/profile` | 405 | 5 | 7.9 | 10.8 | 8.6 | 10.8 | 当前 GET 不支持，不能作为资料接口性能结论 |
| `GET /api/subscription/status` | 401 | 5 | 8.0 | 9.6 | 8.4 | 9.6 | 未登录订阅状态，只能反映未登录拒绝路径 |
| `GET /api/cdk/config` | 401 | 5 | 8.9 | 10.0 | 9.1 | 10.0 | 未登录 CDK 配置，只能反映未登录拒绝路径 |
| `GET /api/admin/check` | 401 | 5 | 8.7 | 15.9 | 9.7 | 15.9 | 未携带动态 token，不能反映真实管理员检查路径 |

本地补充基线：

| 接口或页面 | 状态 | 样本 | p50 | p95 | avg | max | 说明 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /` | 200 | 5 | 81.2 | 100.5 | 86.8 | 100.5 | 首页 HTML 响应，未携带浏览器 Cookie |
| `GET /create` | 200 | 5 | 145.1 | 486.6 | 247.5 | 486.6 | 创作页 HTML 响应，未携带浏览器 Cookie，本轮波动较大 |
| `GET /community` | 200 | 5 | 62.7 | 73.1 | 65.3 | 73.1 | 社区页 HTML 响应，未携带浏览器 Cookie |
| `GET /pricing` | 200 | 5 | 52.3 | 55.8 | 53.2 | 55.8 | 定价页 HTML 响应，未携带浏览器 Cookie |
| `GET /api/auth/get-session` | 200 | 5 | 13.3 | 15.8 | 13.5 | 15.8 | Better Auth 会话端点，未携带浏览器 Cookie，响应体为未登录状态 |
| `GET /api/points/balance` | 401 | 5 | 10.6 | 12.5 | 11.0 | 12.5 | 积分余额，未携带浏览器 Cookie |
| `GET /api/subscription/status` | 401 | 5 | 9.9 | 12.2 | 10.6 | 12.2 | 订阅状态，未携带浏览器 Cookie |
| `GET /api/user/download-terms-status` | 401 | 5 | 11.3 | 19.2 | 13.2 | 19.2 | 下载协议状态，未携带浏览器 Cookie |
| `GET /api/user/images?page=1&pageSize=12` | 401 | 5 | 13.3 | 18.5 | 13.5 | 18.5 | 我的作品，未携带浏览器 Cookie |
| `GET /api/user/images/storage-info` | 401 | 5 | 13.4 | 29.0 | 16.1 | 29.0 | 图片存储信息，未携带浏览器 Cookie |
| `GET /api/cdk/config` | 401 | 5 | 11.7 | 12.5 | 11.4 | 12.5 | CDK 配置，未携带浏览器 Cookie |

登录态基线待补充：
- 本机 Chrome 和 Edge 默认 Profile 正在运行，`Network/Cookies` 被浏览器进程独占锁定，命令行无法读取现有 localhost 会话 Cookie。
- Chrome 未开启远程调试端口，追加 `--remote-debugging-port=9222` 后没有生效，不能直接通过浏览器上下文采集登录态网络数据。
- 其他未锁定 Chrome Profile 未发现 localhost Cookie。
- 因此当前不能把命令行测得的 401 拒绝路径当作登录态接口耗时。
- 后续需要通过已登录浏览器同源脚本、远程调试浏览器，或用户提供专门测试账号后再记录登录态、订阅用户和管理员用户接口耗时。

第一批优化实施记录：
- 状态：已实现，复测待补充
- 数据库影响：无
- 改动范围：`src/utils/dynamicToken.ts`、`src/app/(main)/admin/cdk/page.tsx`、`src/app/api/admin/cdk/route.ts`、`src/utils/cdkManager.ts`、`scripts/test-dynamic-token-cache.mjs`
- 动态 token：首次调用仍请求 `/api/time`，之后 30 秒内复用服务端返回的 `timeString`；并发首次调用合并为同一个 `/api/time` 请求；保留 `/api/time` 失败后使用本地时间的降级逻辑；预留 `resetServerTimeOffset()` 供后续 401 后刷新重试使用。
- 服务端 token 窗口：当前服务端校验实际接受“当前分钟 + 上一分钟”，不是注释里的“±1 分钟”。客户端必须使用服务端返回的 `timeString` 生成 token，不能缓存 timestamp offset 后再按浏览器本地时区格式化。
- 优化前基线：线上 `/api/time` p50 为 356.7ms，p95 为 464.5ms。
- 预期效果：登录态首屏 30 秒内 `/api/time` 请求数从 `K` 降到 `1`；线上 p50 口径下，前置网络往返理论减少约 `(K - 1) × 356ms`。
- CDK 调试请求：全仓 `127.0.0.1:7243/ingest` 调试 fetch 从 30 处降到 0；实际清理范围为 CDK 页面 18 处、CDK 管理接口 6 处、`deleteCDK` 工具 6 处。
- 已完成代码级验证：动态 token 聚焦测试覆盖 30 秒复用、并发合并、TTL 过期刷新和 `resetServerTimeOffset()`；全仓精确搜索确认 `127.0.0.1:7243/ingest`、`#region agent log`、`#endregion` 无残留。
- 待复测：PC 和移动端登录态首屏网络瀑布，重点对比 `/api/time` 请求数；CDK 删除流程确认不再出现 `127.0.0.1:7243` 请求；图片生成、视频生成、工作流修复/放大、用户额度、管理员检查、登录注册和邮箱域名校验确认动态 token 仍通过校验。

动态 token 时区热修记录：
- 状态：已实现，本地待在 `TZ=UTC` 服务端模式下复测
- 数据库影响：无
- 触发原因：线上 `/api/time` 返回的 `timeString` 为 UTC 口径，浏览器在 Asia/Shanghai 下按 timestamp 重新格式化会相差 8 小时，导致 `/api/admin/check`、`/api/generate` 等动态 token 校验失败。
- 修复方式：保留 30 秒 TTL 和 inflight 合并，但缓存服务端返回的 `timeString`，不再缓存 offset，也不再由客户端本地时区重新格式化服务端时间。
- 已验证：补充动态 token 聚焦测试，覆盖服务端 UTC `timeString` 与客户端本地格式化相差 8 小时时仍使用服务端 `timeString` 生成 token。
- 待复测：本地 `TZ=UTC` 启动服务后验证后台入口和图片生成；线上 Tekton 构建后验证后台入口、图片生成、视频生成和工作流修复/放大。

社区和我的作品媒体可视区加载记录：
- 状态：已实现，浏览器复测待补充
- 数据库影响：无
- 触发原因：社区列表和我的作品列表会在一次渲染后批量解码加密媒体；展开全部作品后，尚未滚动到可视区域的媒体也会触发 `.dat` 请求和前端解码。
- 改动范围：`src/hooks/useVisibleMediaKeys.ts`、`src/components/community/CommunityFeedGrid.tsx`、`src/app/(main)/my-works/page.tsx`
- 实现方式：新增基于 `IntersectionObserver` 的可视区键集合；社区卡片和我的作品卡片只有进入视口附近后才挂载图片/视频元素，只有进入视口附近的加密媒体才触发解码；详情弹窗和下载仍会按需解码当前媒体。
- 预期效果：首屏不再因为列表已渲染而请求全部图片或全部 `.dat` 加密媒体；“查看更多/展开全部”后，未滚动到的作品先保留占位，不立即加载真实媒体资源。
- 待复测：PC 和移动端访问 `/community`、`/my-works`，检查首屏网络瀑布中图片和 `.dat` 请求数量；滚动到底部确认图片逐步加载；点击详情、下载、收藏、取消收藏、删除和中风险确认流程正常。

社区标签查询与筛选语义待确认：
- 状态：待确认，未实现
- 数据库影响：无
- 现状：`/api/community/feed` 默认 `sort=latest` 时，前端请求 18 条，服务端先取最近 240 条并过滤，然后对过滤后的全部媒体查询标签，最后再截取当前页返回。
- 影响：当前页每张作品展示的标签仍属于该作品本身，不会串到其他作品；但服务端会为非当前页作品额外查询标签，存在过量查询。点击详情里的标签或顶部推荐标签后，会重新按全站该标签筛选最近 18 条，不限定在原首屏 18 条内。
- 不确定点：标签点击后做全站筛选可能是特意设计；服务端先给 240 条查标签也可能是为了兼容 `hot`、`random` 或后续排序逻辑，需要确认产品意图后再改。
- 候选方案：若确认 `latest` 不需要依赖全量标签排序，则只在 `sort=latest` 下先分页，再仅查询当前页 tags；`hot`、`random` 保持原逻辑，避免改变排序语义。
- 待验证：确认顶部推荐标签和详情标签的产品预期；确认标签筛选是否应全站筛选，还是仅筛当前已加载列表。

Tekton 构建兼容性修复记录：
- 状态：已实现，本地 Next 构建已通过，Tekton 待复测
- 数据库影响：无
- 触发原因：Next.js 15 在预渲染阶段要求使用 `useSearchParams()` 的客户端内容必须位于 `Suspense` 边界内；Tekton 构建失败页为 `/workflows`、`/reset-password`，同类风险页还有 `/verify-email`。
- 改动范围：`src/app/(main)/workflows/page.tsx`、`src/app/(main)/reset-password/page.tsx`、`src/app/(main)/verify-email/page.tsx`
- 实现方式：按项目内支付结果页的现有模式拆出外层页面和内层内容组件，外层提供 `Suspense` fallback，内层保留原有查询参数读取和业务逻辑。
- 已验证：目标页面 ESLint 通过；清理 `.next` 后直接执行 `node_modules/.bin/next build` 通过，`/workflows`、`/reset-password`、`/verify-email` 均完成静态生成。
- 待复测：Tekton 镜像构建；PC 和移动端验证工作流 tab 参数、重置密码 token、邮箱验证 token 仍按原逻辑生效。

线上参考基线：

| 接口 | 状态 | 样本 | p50 | p95 | avg | max | 说明 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /api/time` | 200 | 3 | 356.7 | 464.5 | 386.5 | 464.5 | 动态 token 时间源；每次业务请求前置调用会放大首屏和操作延迟 |
| `GET /api/models` | 200 | 3 | 336.2 | 337.6 | 335.9 | 337.6 | 创建页模型列表 |
| `GET /api/video-models` | 200 | 3 | 361.1 | 434.4 | 384.2 | 434.4 | 视频模型列表 |
| `GET /api/workflows` | 200 | 3 | 360.1 | 411.3 | 376.2 | 411.3 | 工作流列表 |
| `GET /api/stats` | 200 | 3 | 402.6 | 462.2 | 421.4 | 462.2 | 站点统计 |
| `GET /api/community/tags` | 200 | 3 | 518.9 | 1238.1 | 734.1 | 1238.1 | 社区标签，线上波动较大 |
| `GET /api/community/feed?page=1&pageSize=20` | 200 | 3 | 767.9 | 892.6 | 799.2 | 892.6 | 社区首屏列表 |
| `GET /api/points/packages` | 200 | 3 | 455.4 | 479.3 | 431.3 | 479.3 | 积分套餐 |
| `GET /api/subscription/plans` | 200 | 3 | 463.4 | 516.8 | 471.7 | 516.8 | 订阅套餐 |

当前观察：
- 本地最慢的公开只读接口是社区首屏列表、社区标签和订阅套餐，后续应重点对比 `community/feed`、`community/tags`、`subscription/plans`。
- 线上 `/api/time` p50 约 356.7ms。即使接口本身逻辑很轻，只要每次业务请求都先调用它，用户侧就会额外增加一次网络往返。
- 未登录的 `points/balance`、`subscription/status`、`cdk/config`、`admin/check` 只能证明拒绝路径很快，不能证明登录态路径快。
- 首屏真实请求瀑布还需要浏览器侧记录；本次没有验证 `useSession()`、`/api/points/balance`、`/api/admin/check` 在真实登录 Cookie 下的总耗时。

后续复测要求：
- 优化后使用同一组接口、同一样本量和同一账号状态复测。
- 若涉及首屏用户态聚合，需要补充 PC 和移动端浏览器网络瀑布：请求数量、首个用户态接口开始时间、所有用户态接口完成时间。
- 若涉及认证缓存，需要分别验证未登录、普通登录用户、订阅用户、管理员用户、封禁用户。
- 若后续要评估数据库索引或慢查询，必须先提出 SQL 和回退方案，并得到确认后再执行。

## 2026-06-23 后台模型成功率与响应时间统计

状态：已实现

需求说明：
- 后台数据分析页需要展示各模型调用成功率、成功次数、失败次数和响应时间。
- 审核模型、图片生成模型、视频生成模型都需要进入模型统计。
- 第三方生成服务返回 500、网络异常或响应格式异常时，不能继续只显示 100% 成功率。

影响范围：
- 数据库模型调用统计表：`model_usage_stats`
- 模型统计接口：`src/app/api/admin/model-stats/route.ts`
- 后台数据分析页面：`src/app/(main)/admin/analytics/page.tsx`
- 图片生成接口：`src/app/api/generate/route.ts`
- 视频生成接口：`src/app/api/generate-video/route.ts`
- 审核统计工具：`src/utils/modelUsageStats.ts` 及各审核调用链路

实现情况：
- 已为模型调用统计表增加成功状态和模型类型字段。
- 已将后台表格改为“模型成功率与响应时间”，展示成功次数、失败次数和成功率。
- 已增加模型成功率图表和成功率与响应时间气泡散点图。
- 已补齐审核模型统计，页面按模型原始名称展示。
- 已补齐图片生成模型失败统计，第三方调用开始后失败会写入失败记录。
- 已补齐视频生成模型成功和失败统计。

待确认：
- 工作流修复和放大接口是否也需要纳入同一张模型成功率图表。

## 2026-06-10 有参考图的生成案例禁止进入社区

状态：已实现

需求说明：
- 有参考图的生成案例不应进入社区。
- 原因是社区用户无法看到参考图，只看到结果图和提示词时，案例上下文不完整，容易误导用户。

建议影响范围：
- 人工审核通过接口：`src/app/api/admin/god-eye/images/[id]/review/route.ts`
- 社区发布工具：`src/utils/communityMediaPublisher.ts`
- 上帝之眼人工审核页面提示：`src/app/(main)/admin/god-eye/page.tsx`

建议实现方式：
- 在发布到 `community_media` 前检查来源作品的 `referenceImages`。
- 如果 `referenceImages` 数组非空，则禁止人工通过发布到社区。
- 后台返回明确错误，例如“带参考图的作品不能发布到社区”。
- 已经进入社区的历史数据是否下架，需要单独确认。

实现情况：
- 已在社区发布工具中统一拦截带参考图的来源作品。
- 已在人工审核通过接口中将该拦截转换为 400 业务错误。
- 后台页面沿用现有人工审核错误提示展示拦截原因。
- 已在上帝之眼人工审核列表增加“参考图”筛选，支持筛选全部、有参考图、无参考图。

待确认：
- 历史已经发布到社区的参考图案例是否需要批量下架。

## 2026-06-15 动态切换图片模型同步路由参数

状态：已实现

需求说明：
- 从 AI 广场、首页或社区入口进入创作页时，URL 会携带 `model` 参数。
- 用户在图片生成表单中切换模型后，URL 中的 `model` 参数需要同步更新。
- 避免用户刷新页面后，又回到入口 URL 中的旧模型。

影响范围：
- 图片生成区模型状态：`src/components/GenerateSection.tsx`
- 图片模型选择表单：`src/components/GenerateForm.tsx`
- 创作页入口参数读取：`src/app/(main)/create/CreateClient.tsx`

实现情况：
- 已在图片模型切换入口同步更新当前 URL 的 `model` 查询参数。
- 已在切换到图片模型时移除 `tab=video`，避免刷新后进入视频生成页。
- 已覆盖桌面端和移动端图片生成表单的模型切换入口。

待确认：
- 是否需要在图片/视频 Tab 切换时也同步 URL 参数，需要单独确认。

## 2026-06-15 画同款提示词避免暴露在 URL

状态：方案讨论中，未实现

需求说明：
- 当前点击社区图片“画同款”时，会通过 `/create?prompt=...` 把提示词传入创作页。
- 提示词会暴露在地址栏、浏览器历史、截图和访问日志中。
- 希望改为其他传入方式，避免完整提示词出现在 URL 中。

影响范围：
- 社区“画同款”入口：`src/app/(main)/community/CommunityPageClient.tsx`
- 首页/创作页社区展示同款入口：`src/app/(main)/HomeClient.tsx`、`src/app/(main)/create/CreateClient.tsx`
- 创作页参数读取与提示词初始化：`src/app/(main)/create/CreateClient.tsx`、`src/components/GenerateSection.tsx`

待确认：
- 需要确认新方式是否只要求同标签页刷新保留提示词，还是需要支持复制链接、新标签页或跨设备恢复提示词。

## 2026-06-18 用户头像审核失败禁止上传

状态：已实现

需求说明：
- 用户头像以未加密图片形式存储到 OSS，违规头像会触发 OSS 风险警告。
- 头像上传必须在服务端审核通过后才能写入 OSS。
- 审核服务不可用或未配置时应禁止上传，不能降级放行。
- 用户资料接口不能接受任意头像 URL，避免绕过头像上传审核链路。

影响范围：
- 头像审核结果解析：`src/utils/avatarModeration.ts`
- 头像上传接口：`src/app/api/upload/route.ts`
- 用户资料更新接口：`src/app/api/profile/route.ts`

实现情况：
- 已调整头像审核结果判断顺序，避免“不通过”因包含“通过”被误判放行。
- 已将头像上传接口改为审核配置缺失时直接拒绝上传。
- 已将头像审核异常保持为拒绝上传。
- 已限制用户资料接口中的头像地址，只允许默认头像、本地图片路径、当前已保存头像，或当前 OSS `avatars/` 路径。

待确认：
- OSS 中已存在的历史违规头像是否需要批量替换为默认头像并删除源文件。

## 2026-07-03 创作页社区画同款链路排查

状态：待排查，未实现

需求说明：
- 创作页面中的社区作品“画同款”可能存在提示词或参考素材恢复异常。
- 初步观察到社区页、首页和创作页内的“画同款”入口使用的参数来源不完全一致，需要统一确认。
- 视频同款链路中，社区提示词进入创作页后可能只同步到图片提示词状态，未同步到视频提示词输入框。

影响范围：
- 社区页“画同款”入口：`src/app/(main)/community/CommunityPageClient.tsx`
- 首页社区展示“画同款”入口：`src/app/(main)/HomeClient.tsx`
- 创作页社区展示“画同款”入口：`src/app/(main)/create/CreateClient.tsx`
- 创作页提示词恢复与图片/视频表单状态：`src/components/GenerateSection.tsx`
- 社区同款详情接口：`src/app/api/community/media/[id]/route.ts`
- 画同款参数传递工具：`src/utils/createPromptTransfer.ts`

已发现的可疑点：
- 社区 feed 页面传递的是 `communityMedia.id`，而首页/创作页社区展示依赖 `communityMediaId`；默认静态补位作品没有 `communityMediaId`，会退回草稿或提示词传递方式。
- `/api/community/media/[id]` 当前按社区作品 ID 查询，如果入口传入来源作品 ID，可能读取失败。
- 视频“画同款”进入创作页后，需要确认 `initialPrompt` 是否同步到 `videoPrompt`，否则视频生成输入框可能为空。
- 创作页内同页跳转时，`promptEdited`、页面草稿和 URL 参数变化可能影响同款提示词恢复。

待确认：
- 问题是否只发生在创作页内的社区展示，还是社区页、首页入口也会出现。
- 图片同款和视频同款是否都受影响。
- 默认静态作品是否仍需要支持“画同款”，以及是否允许继续使用草稿传递。
- 是否需要统一所有入口只传 `communityMediaId`，并为无社区 ID 的静态作品单独降级处理。
