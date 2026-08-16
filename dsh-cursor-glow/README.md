# dsh-cursor-glow 插件说明

给 DSH Web GUI 加的「呼吸灯箭头」光标光效插件。

## 文件结构

| 文件 | 作用 |
|---|---|
| `lib/client.js` | 浏览器端光效代码 + 设置面板（参数默认值在这里，日常调参走设置页） |
| `lib/index.js` | host 端挂载点（空实现，无需改动） |
| `package.json` | 插件声明（`dsh.client` 注册客户端入口） |
| `cordis.patch.yml` | bundle 挂载声明 |
| `preview/preview.html` | 独立预览页，浏览器直接打开即可看效果 |
| `preview/preview.js` | 预览页引用的光效代码（与 `client.js` 逻辑一致） |

> `preview/preview.js` 和 `lib/client.js` 的光效逻辑一致，但包装不同：
> - `preview.js` 是普通 IIFE，浏览器可直接运行（`preview.html` 引用它）
> - `client.js` 包装在 DSH 模块加载器里，供插件加载
>
> 改默认值时记得**两边同步**（`preview.js` 只影响独立预览页）。

## 设置面板

本插件在 DSH Web GUI 的「设置」里注册了一个 **光标光效** 标签页，所有参数都能在界面里实时调整，改动即时生效并自动保存到 `localStorage`（键 `dsh-cursor-glow:config`）。下方列出的是可调参数及其默认值（默认值定义在 `lib/client.js` 顶部的 `DEFAULT_CONFIG` 对象）。

### 箭头

| 参数 | 默认值 | 说明 |
|---|---|---|
| `arrowSize` | `24` | 箭头 SVG 尺寸（px） |
| `arrowFill` | `'#000000'` | 箭头填充色（当前为黑心） |
| `arrowStroke` | `'#ffffff'` | 箭头描边色（当前为白边） |
| `arrowStrokeWidth` | `2` | 描边粗细 |
| `arrowFillOpacity` | `0.4` | 填充透明度（黑心） |
| `arrowStrokeOpacity` | `0.8` | 描边透明度（白边） |

### 圆形光晕

| 参数 | 默认值 | 说明 |
|---|---|---|
| `haloSize` | `28` | 光晕直径（px） |
| `haloBlur` | `6` | 光晕模糊程度（px） |
| `haloCenterX` / `haloCenterY` | `9` / `10.5` | 光晕中心 = 箭头图标中心（不要改成尖端 `2,2`） |
| `breatheDuration` | `2` | 呼吸周期（秒） |
| `breatheScaleMin` / `breatheScaleMax` | `0.9` / `1.15` | 呼吸时缩放范围 |
| `breatheOpacityMin` / `breatheOpacityMax` | `0.52` / `0.8` | 呼吸时透明度范围（越大越亮） |
| `hueCycleMs` | `6000` | 色相流动一圈的时间（毫秒，6 秒） |

## 预览

直接用浏览器打开 `preview/preview.html` 即可看效果。

## 如何修改并生效

- **日常调参**：直接打开「设置 → 光标光效」标签页即可，无需改代码。
- **改默认值 / 改代码后重新部署**：

  1. 编辑 `lib/client.js`（`preview/preview.js` 同步改，仅影响预览页）
  2. 复制到已安装位置：

     ```bash
     cp -R /Users/law/Documents/code/law-dsh-plugin/dsh-cursor-glow \
          /Users/law/.dsh/profiles/web/node_modules/
     ```

  3. **重启 dsh web**（在启动它的终端按 `Ctrl+C` 再重新运行 `dsh web`）
  4. 浏览器刷新 `http://127.0.0.1:3080`

## 卸载

把 `~/.dsh/profiles/web/package.json` 里的 `dependencies` 和 `dsh.profile.bundles` 中的 `dsh-cursor-glow` 删掉，删除 `node_modules/dsh-cursor-glow/` 目录，重启 dsh web 即可。
