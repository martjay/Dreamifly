# TODO

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
