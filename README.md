# law-dsh-plugin

给 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) Web GUI 做的**插件与工具集合**。每个子目录是一个独立可安装的 DSH 插件或离线工具，可单独安装、单独使用。

## 包含内容

| 目录 | 类型 | 说明 |
|---|---|---|
| [`dsh-git-graph`](./dsh-git-graph) | 插件 | Git 提交图谱可视化，对标 VS Code Git Graph：泳道图、分支配色、提交详情、diff 语法高亮 |
| [`dsh-cursor-glow`](./dsh-cursor-glow) | 插件 | 「呼吸灯箭头」光标光效，带彩色粒子拖尾，可在设置里实时调参 |
| [`dsh-icon-preview`](./dsh-icon-preview) | 离线工具 | DSH 预设图标（`Icon*`）的离线总览页，可搜索、点击复制图标名 |

> `gen/` 目录存放生成的图片等临时产物，已加入 `.gitignore`，不纳入版本管理。

## 安装插件

DSH 插件用 `dsh plugin` 命令安装（会转发给 pnpm 并自动登记 bundle）：

```bash
# 以 dsh-git-graph 为例（其它插件同理）
dsh plugin --profile web add file:/Users/law/Documents/code/law-dsh-plugin/dsh-git-graph
```

然后**重启 dsh web**（`Ctrl+C` 后重新运行 `dsh web`），刷新 `http://127.0.0.1:3080` 即可。

各插件的具体用法、文件结构、预览方式见各自目录下的 README。

## 卸载插件

```bash
dsh plugin --profile web remove <插件名>
```

重启 dsh web 即可。

## 目录结构

```
law-dsh-plugin/
├── dsh-cursor-glow/    # 光标光效插件
├── dsh-git-graph/      # Git 提交图谱插件
├── dsh-icon-preview/   # DSH 图标离线总览
└── gen/                # 生成产物（已忽略）
```

## License

[MIT](./LICENSE)
