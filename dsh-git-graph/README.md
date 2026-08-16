# dsh-git-graph 插件说明

给 DSH Web GUI 加的「提交图谱」可视化插件，效果类似 VS Code 的 Git Graph 扩展：把当前会话仓库的分支 / 合并 / 标签关系画成泳道图，点任意提交可查看信息、改动文件与 diff。

## 文件结构

| 文件 | 作用 |
|---|---|
| `lib/git.js` | 后端 git 操作（`spawn git`），构建提交 DAG 与提交详情 |
| `lib/index.js` | host 端：注册 `/gitgraph/api` HTTP 路由 |
| `lib/client.js` | 浏览器端：泳道布局 + SVG 渲染 + 面板 UI |
| `package.json` | 插件声明（`dsh.bundle.patch` + `dsh.client`） |
| `cordis.patch.yml` | bundle 挂载声明 |

## 功能

- 按 `--topo-order --all` 拉取提交 DAG（新→旧），每个分支一条彩色泳道，合并用曲线连接。
- 提交行显示短 hash、作者、相对时间，以及 HEAD / 分支 / 标签 / 远程 彩色标记。
- 点击提交：右侧详情面板显示完整提交信息、改动文件列表、stat 与 diff。
- 顶部工具条：仓库路径（默认会话工作目录）、提交数量上限、刷新。

## 入口

- 若安装了 `dsh-better-sidebar`，会自动注册一个 **Git Graph** 侧边栏标签页。
- 无论是否安装 sidebar，侧边栏底部都会有一个分支图标按钮，点击打开全屏浮动面板。

## 安装

```bash
dsh plugin --profile web add file:/Users/law/Documents/code/law-dsh-plugin/dsh-git-graph
```

然后**重启 dsh web**（`Ctrl+C` 后重新运行 `dsh web`），刷新 `http://127.0.0.1:3080`。

## 卸载

```bash
dsh plugin --profile web remove dsh-git-graph
```

重启 dsh web 即可。

## 说明

- 仓库路径优先取会话头部的 `cwd`（即 DSH 会话的工作目录）；若为空回退到 dsh web 进程的 `process.cwd()`，也可在工具条手动输入。
- 提交数量上限默认 300（`-n`），超出部分在图底部自然截断。
- diff 对合并提交使用 `-m --first-parent`，保证总能展示内容。
