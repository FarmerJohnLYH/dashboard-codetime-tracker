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
