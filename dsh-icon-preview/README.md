# dsh-icon-preview

DSH 预设小图标（`@deepseek-ai/dsh-client-ui-primitives` 的 `Icon*` 组件）的**离线总览页**：列出全部图标的图形与名称，点击任意图标复制其名称，支持按名称搜索。

## 预览

直接用浏览器打开 `preview/preview.html` 即可，无需安装。

## 重新生成

图标集更新后，可重新生成预览页：

```bash
node scripts/generate-preview.mjs
```

脚本从 DSH 安装的 `node_modules` 里读取 primitives 包，用 React SSR 把每个 `Icon*` 组件渲染成 SVG 字符串再拼进 HTML。若你的 DSH `node_modules` 不在默认路径，用环境变量覆盖：

```bash
DSH_NODE_MODULES=/path/to/dsh/node_modules node scripts/generate-preview.mjs
```

## 文件

| 文件 | 作用 |
|---|---|
| `preview/preview.html` | 离线图标总览页（已生成） |
| `scripts/generate-preview.mjs` | 从 primitives 包重新生成预览页的脚本 |
