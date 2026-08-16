# dsh-git-graph

给 DeepSeek Harness（DSH）Web GUI 加的 **Git 提交图谱可视化插件**，效果对标 VS Code 的 [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) 扩展：把当前会话仓库的分支、合并、标签关系画成一张彩色的泳道图，点任意提交即可查看完整信息、改动文件与 diff。

![dsh-git-graph 截图](docs/screenshot.png)

## 这是什么

DSH 的 Web 界面原本没有图形化的提交历史视图。`dsh-git-graph` 补上了这块：它直接读取会话工作目录所在的 git 仓库，用 `git log --all --topo-order` 拉取提交 DAG，在浏览器里渲染成 VS Code Git Graph 风格的泳道图，让你不离开界面就能看清整个仓库的演进脉络。

## 功能

- **泳道图**：每个分支一条彩色泳道，直线表示父子继承，曲线表示合并，一目了然。
- **Refs 标记**：`HEAD`（红）、本地分支（绿）、远程分支（蓝）、`tag`（黄）以彩色 pill 标注在对应提交旁。
- **提交列表**：短 hash、作者、相对时间与主题，随图谱对齐滚动。
- **提交详情**：点击任意提交，右侧面板展示完整提交信息、改动文件列表（M/A/D/R）、stat 统计与 diff。
- **仓库路径**：默认取会话工作目录，也可在工具条手动指定任意本地仓库。
- **数量上限**：可调提交条数（默认 300，上限 2000），避免超大仓库卡顿。

## 入口

- 若安装了 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar)，会自动注册一个 **Git Graph** 侧边栏标签页。
- 无论是否安装 sidebar，侧边栏底部都会有一个分支图标按钮，点击打开全屏浮动面板。

## 架构

插件分两部分，通过 HTTP 路由桥接：

| 部分 | 文件 | 职责 |
|---|---|---|
| Host（Node 端） | `lib/git.js` | `spawn git` 构建提交 DAG、refs、提交详情与 diff |
| Host（Node 端） | `lib/index.js` | 注册 `/gitgraph/api` 路由（`graph` / `commit`），含 CSRF 防护 |
| Client（浏览器端） | `lib/client.js` | 泳道布局算法 + SVG 渲染 + 面板 UI |

数据流：浏览器 `fetch('/gitgraph/api/graph')` → host 用 `git` 命令读取仓库 → 返回 JSON → 客户端做泳道布局并渲染成 SVG。

## 预览

无需安装，直接用浏览器打开 `preview/preview.html` 即可离线查看图谱渲染效果（泳道 / 合并曲线 / refs 标记 / 提交详情），使用内置模拟数据。

## 安装

```bash
dsh plugin --profile web add file:/Users/law/Documents/code/law-dsh-plugin/dsh-git-graph
```

然后**重启 dsh web**（`Ctrl+C` 后重新运行 `dsh web`），刷新 `http://127.0.0.1:3080` 即可。

## 卸载

```bash
dsh plugin --profile web remove dsh-git-graph
```

重启 dsh web 即可。

## 说明

- 仓库路径解析顺序：会话头部 `cwd` → 工具条手动输入 → `process.cwd()`。
- 提交数量上限默认 300（`git log -n`），超出部分在图底部自然截断。
- 合并提交的 diff 使用 `-m --first-parent`，保证总能展示内容。
- 所有 `git` 调用均为只读操作，不修改仓库状态。

## License

MIT
