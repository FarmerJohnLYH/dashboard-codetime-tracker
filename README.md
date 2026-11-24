# Dashboard - a simple code time tracker

本地、零运行时依赖的 VS Code 文件级时间与累计编辑统计。

## 安装及使用

在 VS Code 扩展菜单选择 Install from VSIX，安装随附的 VSIX 文件。
命令面板运行 `Dashboard: Open`，或点击右下角状态栏的 `</> x h x m`。
状态栏显示本地今天所有项目的累计实际停留时间（与报表“实际用时”一致），按整分钟显示，每 10 秒更新；自动恢复历史记录，跨日重新累计，不随报表所选日期改变。
正常使用文件编辑器即可自动记录；表格与时间线分别提供每日汇总及活动明细。

- 点击项目名称旁的铅笔修改别名，不影响路径身份与历史。
- 点击 Jira 任务单元格关联 Task/SubTask，留空取消关联。任务类型由使用者手工确认，不连接内网。
- 项目以工作区目录完整 URI 为身份；未归属工作区的文件以自身 URI 独立归类。展开行查看完整文件路径。
- 不同目录中的同名工程独立统计；远程 URI 保留主机信息，但远程使用尚未实测。
- 项目关联任务对该项目全部历史生效。一个项目暂只支持一个任务，不能按会话拆分任务。
- 日期按运行插件的本地时区划分，跨午夜拆分；当天同一任务先合并再按 0.5h 四舍五入（15 分钟进到 0.5h）。共享任务的合计只在第一行显示。
- “实际用时”是窗口前台文件停留时间，包含静止阅读。它不是经过人工确认的工时；请自行核对后填写 Jira。
- 活跃时间按输入、选择和滚动更新；默认空闲阈值 5 分钟，设置 `dashboard.idleMinutes` 可调整。
- 新增/删除按 UTF-16 长度累计，包括未保存、写后删除、撤销/重做及可观察的插件修改。不是 Git diff 或人工贡献量。

## 数据及性能

无遥测、无网络请求，不保存代码正文。数据位于 VS Code 的扩展 globalStorage 目录下 `farmerjohnlyh.dashboard-simple-code-time-tracker`。
每 10 秒批量写入，按日期与窗口隔离，临时文件 rename 原子替换。崩溃可能损失最后一个未写入批次。跨日期后内存仅保留最近日期的聚合记录。
输入事件只计算增量；100,000 次同一文件输入仍聚合成同一会话记录。没有全文扫描及 Git 调用。

## 范围与限制

第一版记录普通文本文件。终端、网页、自定义编辑器、会议和硬件调试不计时；打开 Dashboard 时不将查看报表时间计入代码文件。后台观察到的编辑可能有增删量但时间为零。
多窗口数据不会相互覆盖；依赖 VS Code 焦点事件防止重复计时，跨设备汇总及严格的跨窗口重叠消除未实现。
超过 30 秒的计时回调间隔视为休眠或宿主停顿，跳过该间隔。文件移动/重命名以新 URI 单独统计，不迁移历史。
大型格式化或外部变化可能产生较大增删量；无法准确区分 AI、手工、Git checkout。
保存失败会显示提示。备份时复制整个扩展 globalStorage 目录。

## 开发

Node.js 22.22.2+（22.x）、24.15.0+（24.x）或 26+；`npm ci`、`npm test`、`npx vsce package --no-dependencies --allow-missing-repository`。
`test/integration.cjs` 是真实 VS Code 扩展宿主测试入口；测试需可启动的桌面环境。
使用 UI 模板中的 VS Code 主题变量自动适配亮色、暗色和高对比主题。

## 0.1.1 更新

补充边界、持久化、异步生命周期和页面交互测试。修复 Dashboard 激活时继续计时、重复通知重置空闲时间、后台编辑记录膨胀、旧日期响应覆盖新日期、关闭页面后的异步访问、多窗口配置覆盖、保存失败重试及跨日清理的数据丢失风险。
项目别名与任务配置分别原子保存到 project-fields 目录，旧版 projects.json 自动兼容读取，不删除旧数据。损坏记录会提示，原文件保留。相同项目的相同字段被同时修改时采用最后一次成功写入。

运行 `npm run test:coverage` 可复现测试和后端覆盖率。Webview 脚本使用 JSDOM 进行行为测试；不包含真实浏览器布局、颜色、字体或 CSP 执行验证。

## 0.1.2 本机验收

修复暗色主题日期图标，并补齐可复现的浏览器测试与独立宿主测试。
已在本机 macOS VS Code 1.137.0 完成界面与未保存编辑持久化验证。截图和原始测试输出仅保留本地。
本轮用户保持锁屏，真实前台计时和失焦停表仍待解锁验证。

浏览器回归：`npx playwright install chromium` 后执行 `npm run test:browser`。
也可通过 `CHROMIUM_PATH` 指定已有的 Chrome / Chromium 可执行文件。

真实宿主回归（在已解锁桌面中运行，并保持测试窗口前台）：

```sh
test_profile=$(mktemp -d /tmp/dashboard-test.XXXXXX)
DASHBOARD_TEST_UNLOCKED=1 DASHBOARD_TEST_USER_DATA_DIR="$test_profile" code \
  --user-data-dir "$test_profile" \
  --extensions-dir "$test_profile/extensions" \
  --extensionDevelopmentPath="$PWD" \
  --extensionTestsPath="$PWD/test/integration.cjs" \
  --disable-workspace-trust --skip-welcome
cat "$test_profile/integration-result.json"
```

`DASHBOARD_TEST_UNLOCKED=1` 仅应在确认桌面已解锁时设置；未设置时跳过前台计时验收。结果中的 `complete: true` 表示前台计时与报表停表均已验证；锁屏或失焦时会列出 `skipped`，不能当作完整通过。
