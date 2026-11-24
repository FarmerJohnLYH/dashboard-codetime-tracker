# 1.1.0 回归验证 — 2026-11-24

本轮先从 GitHub 拉取并核对 `main`，基线提交 `63d1b1d`。使用 Node 24 执行 `npm run test:coverage`：**71 个测试节点通过，0 失败**（含 1 个父测试分组）。`src/core.js`、`src/storage.js`、`src/extension.js` 行覆盖率均为 100%；分支分别为 97.89%、95.95%、89.63%。这不等于穷尽所有平台行为，也不包含 Webview 渲染覆盖率。

## 问题与自动化用例对应

| 问题 / 风险 | 回归验证 |
| --- | --- |
| 相同名字、不同本地/远程路径重复显示 | `workload.test.js`：同名自动合并、别名优先、区分大小写、用时求和、文件 URI 保留、同一 URI 去重 |
| 不同 Jira 任务被合并时静默丢失 | `workload.test.js`、`lifecycle.test.js`、`ui.test.js`：冲突任务可见，重命名及关联应用整组，重启后保留 |
| cherry-pick 式整段替换被当作手工劳动 | `workload.test.js`：文档变更与键盘活动独立，整段替换不延长活跃时间；粘贴、多光标、格式化、撤销/重做不会按字符数量增加键盘指标 |
| 键盘、鼠标、命令及后台事件混淆 | `lifecycle.test.js`：只统计当前前台编辑器的 Keyboard / Mouse 事件；不统计 Command、未知来源、其他编辑器或失焦后的键盘事件 |
| 旧记录缺少新字段 | `storage.test.js`、`workload.test.js`、`ui.test.js`：兼容旧 JSON，拒绝非法新计数，旧值显示未知，混合记录标记部分统计 |
| Windows `EPERM: operation not permitted, rename ...tmp -> ...json` | `storage.test.js`：短暂锁定后成功、退避间隔、七次尝试后失败、旧 JSON 完整保留、临时文件清理、同目标排队、后续重试恢复 |
| 其他文件错误及更新丢失 | `storage.test.js`：EACCES/EBUSY 可恢复，ENOSPC/ENOENT 不误重试；`lifecycle.test.js`：失败去重提示、内存数据可见、恢复后只保存一次、慢写时新事件不丢 |
| 表格与时间线展开状态键冲突 | `ui.test.js`：项目与行使用相同原始 ID 时分别保持自己的展开状态 |
| Node 22.14 加载 undici 报 `createZstdDecompress.bind` 错误 | `runtime.test.js`：版本边界与 zstd API 预检，先输出明确环境要求；使用临时 Node 24 完成验证 |
| Playwright 默认 headless-shell 未安装 | `runtime.test.js`：缺少浏览器时给出安装命令；支持 CHROMIUM_PATH，使用普通 Chromium 的 headless 模式 |
| 沙箱阻止 Chrome 启动，SIGABRT / kill EPERM | `runtime.test.js`：启动失败必须报错，不把它当成 UI 验证通过；本轮在允许启动浏览器的环境重新执行通过 |
| VS Code `listen EINVAL` | `runtime.test.js`：过长 Unix IPC 配置路径预检；`npm run test:host` 使用 /tmp 短路径独立配置，不使用项目长路径作为 user-data-dir |

## 浏览器与真实宿主

- 真实 Chrome 的 `npm run test:browser` 通过：同名合并及两条完整文件路径、独立工作量列、移除填报工时、表格/时间线切换、412px 表格内部滚动、空状态、四种 VS Code 原生控件主题；无脚本或 CSP 错误。截图保存在本地 `review/1.1.0/`，使用演示数据，不上传仓库。
- macOS VS Code 1.137.0 独立扩展宿主通过：临时插入及删除各 9 个字符持久化；2 个程序化内容事件的键盘活动为 0；保存事件为 1。`npm run test:host` 启动器也已实际执行通过。原始结果在本地 `review/1.1.0/host-runner-result.json`。
- **未确认项**：前台计时需要解锁桌面并保持测试窗口聚焦，宿主结果明确标记 skipped；Windows 的真实文件锁与真实键盘输入法、Remote SSH 尚未实机验收。Windows 错误在本轮通过注入 Node 文件系统错误码覆盖，不能等同于 Windows 实机验证。
- 新增 GitHub Actions：Ubuntu、Windows、macOS 的 Node 回归及 Playwright 浏览器测试。CI 运行状态应以对应提交的 GitHub Actions 结果为准。

## 复现

```sh
npm ci
npm run test:coverage
npx playwright install chromium
npm run test:browser
npm run test:host
npx vsce package --no-dependencies
```

Node 版本要求见 README；真实宿主测试需安装 VS Code，必要时用 `VSCODE_PATH` 指定入口，Windows 指向 `Code.exe`。使用单独临时配置，不读取日常用户记录。测试配置和报告保留以便排查，退出测试应用后可自行移除。只有确认桌面解锁并保持前台时才设置 `DASHBOARD_TEST_UNLOCKED=1`。

---

以下为旧版历史验证记录，统计口径和版本范围以其标题为准。

# 0.2.0 状态栏功能验证

51 个自动化测试节点通过，0 失败。新增状态栏用例覆盖右侧位置与零值、多个项目当天停留时间合计、历史日期切换、当前会话去重、其他窗口数据、重启恢复、本地午夜切换、乱序读取及错误提示。

本机 VS Code 已确认状态项位于 `right-items`，实际显示 `</> 1 h 17 m`，与当天磁盘记录合计一致；点击可打开报表，切换历史日期不改变今天累计值。使用独立测试数据，截图仅保存在本地。

统计口径为今天累计实际停留时间（dwell），按整分钟向下取整，格式 `</> x h x m`，每 10 秒更新。与本轮功能无关的锁屏前台验收边界仍适用。

---

# 0.1.2 本机验收 — 2026-11-24

本机 macOS VS Code 1.137.0 真实扩展宿主已验证未保存新增/删除持久化；重命名、任务关联、日期切换、明暗主题和窄屏界面已截图。用户保持锁屏，宿主 focus 信号不能证明真实桌面前台状态，因此前台文件计时与失焦停表仍待解锁验证。

45 个自动化测试节点通过；后端行覆盖率 100%、分支 93.72%、函数 95.16%。真实 Chromium 回归验证四种原生日期控件主题、表格/时间线、412px 布局及空状态，无脚本/CSP 错误。0.1.2 VSIX 已在独立目录安装核验。

按用户要求，仅提交代码和开发文档；10 张实机截图及原始结果保留本地，不上传仓库。Windows、Remote SSH、长时间空闲和休眠未做本轮实机验收。以下 0.1.1/0.1.0 内容是历史记录。

---

# 0.1.1 自动化测试报告

执行：`npm run test:coverage`
结果：45 个测试节点通过（含 1 个父测试分组，44 个叶子用例），0 失败。
后端覆盖率：行 100%，分支 93.25%，函数 95.16%。覆盖率仅指 src/core.js、src/storage.js、src/extension.js；不把 JSDOM 中的 Webview 脚本计入这一百分比。

新增验证包括：20 个窗口并发保存、重启读取、保存失败不覆盖旧文件、损坏数据保留与告警、别名/任务并发写入、旧版配置兼容、时间回拨、夏令时、2000 次随机焦点与文件切换的总时长守恒、后台 10000 次编辑聚合、撤销重做、取整秒级边界、日期输入校验、真正 deactivate/activate 生命周期、慢写入时不丢新事件、关闭页面期间读取、乱序日期响应、跨日清理保留完整旧记录、页面恢复状态异常及文本转义。

测试的边界：VS Code API 使用模拟对象，文件系统是真实临时目录；JSDOM 执行实际页面脚本，但不验证真实浏览器渲染、CSP 或 Windows API。原生运行环境限制未解除，不宣称桌面端验收通过。

---
以下为 0.1.0 的环境记录及手工验收清单：

# Test report — 2026-11-24

## Automated coverage

Node test runner covers incremental edits including insert/delete before save and undo metadata; focus/file transitions; idle cap; long host gaps; local midnight splitting; task-level half-hour rounding; distinct absolute paths and project aliases; 100,000 edits aggregating to one session; extension event wiring and atomic disk persistence using a mocked VS Code API; actual Webview JavaScript table/timeline switching, full paths, rename/task messages, date navigation, empty state and HTML escaping using JSDOM.

The 100,000-edit core loop took about 57–71 ms in this environment. This is a synthetic core microbenchmark, not an end-to-end latency or CPU guarantee.

Official VS Code CLI successfully installed the generated VSIX in an isolated extension directory.

## Real runtime attempt

Downloaded official stable VS Code Linux x64. Attempted running the extension-host test in test/integration.cjs with an isolated user profile. Electron exited with status 133; environment blocks local Unix sockets. Chromium also failed before page creation with `socket() failed: Operation not permitted`. Therefore desktop UI screenshots and actual extension-host integration are NOT verified. No generated mockup is represented as an implementation screenshot.

## Manual acceptance on user machine

1. Install VSIX; open a folder and a text file. Insert a distinctive string, delete it before save, open Dashboard. Both added and deleted totals must increase.
2. Expand project; verify full absolute file path. Rename project, reload VS Code and confirm alias/history remain.
3. Set a Task/SubTask; check daily task rounding. Different project rows sharing a task show the combined rounded value once.
4. Switch table/timeline and dates. Verify light/dark theme adaptation and long path wrapping.
5. Switch away from VS Code, return; verify absence is excluded. Leave file foreground idle; dwell continues and active time caps at configured threshold.
6. Restart and verify persistence. Force-kill may lose the last unflushed 10-second batch.

## Known boundaries

Windows and Remote SSH runtime are untested. Task assignment is per project and applies to history; per-session task assignment is not implemented. No Jira server validation. Foreground dwell is a reference for worklogs, not approved billable time. No terminal/webview/custom-editor time, cross-device sync, or file rename history migration. No application screenshot is available from this environment.
