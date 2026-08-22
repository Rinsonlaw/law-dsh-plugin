# dsh-git-graph P0 功能规划

> 状态：已确认，实施中。最后更新随 A 块实现同步。

## 一、目标

把 `dsh-git-graph` 从「只读提交图浏览器」升级为「能在图上操作 git」的工具，并补齐检索导航能力。

P0 分两块：

- **A 块 · 交互写操作**：在图上执行 checkout / 分支 / tag / merge / cherry-pick / revert / reset 等操作。
- **B 块 · 检索与导航**：搜索过滤、键盘上下选择、作者过滤下拉。

## 二、A 块：交互写操作

### 2.1 操作清单与 git 命令

| 操作 | 入口 | git 命令 | 危险级 |
|---|---|---|---|
| 切换分支/提交 | 右键 ref 药丸 / 提交行 | `git checkout <ref>`（hash 走 detached，加 `--detach`） | 低（需先查 dirty） |
| 新建分支 | 右键提交 | `git branch <name> <hash>`，可选 `git checkout -b` | 低 |
| 重命名分支 | 右键 ref | `git branch -m <old> <new>` | 低 |
| 删除本地分支 | 右键 ref | `git branch -d <name>`（默认安全，未合并报错） | 中 |
| 合并分支 | 右键 ref → 合并到当前 | `git merge <name>`，选项 `--no-ff` / `--squash` | 中（可能冲突） |
| 打 tag / 删 tag | 右键提交 | `git tag <name> <hash>` / `git tag -d <name>` | 低 |
| cherry-pick | 右键提交 | `git cherry-pick <hash>` | 中（可能冲突） |
| revert | 右键提交 | `git revert <hash> --no-edit` | 中 |
| reset | 右键提交 | `git reset --soft/--mixed/--hard <hash>` | 高（`--hard` 极危险） |
| 删除远程分支 | 右键 ref | `git push origin --delete <name>` | 高（网络副作用） |

### 2.2 后端新增（`lib/git.js`）

新增纯函数，全部走现有 `runGit(cwd, args)`（spawn 数组天然防命令注入）：

- `getStatus(cwd)` → `git status --porcelain=v1 -b`，解析当前分支、upstream、ahead/behind、dirty 文件（所有写操作的前置检查）。
- `checkout(cwd, ref, { detach })`
- `createBranch(cwd, name, from, { checkout })` / `renameBranch` / `deleteBranch(cwd, name, force)`
- `merge(cwd, ref, { noFf, squash })` — 冲突时返回结构化 `{ conflict: true }` 而非抛错。
- `createTag` / `deleteTag`
- `cherryPick(cwd, hash)` / `revert(cwd, hash)`
- `reset(cwd, hash, mode)`
- `deleteRemoteBranch(cwd, name)`

参数校验：所有 `name`/`ref` 拒绝空、含空白、`-` 开头（防选项注入）、`..`、`~ ^ : ? * [ \` 等非法字符；hash 必须匹配 `^[0-9a-f]{7,40}$`。

### 2.3 RPC 接口（`lib/index.js`）

复用现有 `/gitgraph/api/<method>` 白名单路由，直接扩展 method 分支，**每个 method 内部硬编码 git 命令，绝不接受任意命令字符串**：

```
status / checkout / createBranch / renameBranch / deleteBranch /
merge / createTag / deleteTag / cherryPick / revert / reset / deleteRemoteBranch
```

统一响应 `{ ok, value }`；写操作返回 `{ success, output, branch }`，客户端据此自动 `load()` 刷新并在标题栏提示当前分支。

### 2.4 安全模型（已确认：直接开放 + 每次确认）

1. 写入口常驻可见，**每次写操作弹确认框**。
2. **dirty 前置检查**：会改动 HEAD/worktree 的操作先 `getStatus`，有未提交变更时弹警告（checkout/merge/reset 尤其重要）。
3. **分级确认弹窗**：
   - 低/中危：单一确认框，展示将要执行的 git 命令原文 + 影响对象。
   - 高危（`reset --hard`、删远程分支、`-D` 强制删）：红色确认，需额外输入分支名确认；`reset` 默认只提供 `--soft`/`--mixed`，`--hard` 单独红色确认。
4. **DSH agent 环境风险**：写操作会改变 agent 会话 HEAD（cwd 不变但分支变）。写操作后返回新 `branch`，前端刷新并提示；`reset --hard`/`checkout` 会丢弃工作区内容的操作，弹窗额外说明「影响 agent 当前工作目录」。

### 2.5 前端交互（`client.template.js`）

- **右键菜单**：在 `.gg-row` 与 `.gg-ref` 上 `onContextMenu`，自绘 `gg-context-menu`（纯 React），按「是否 ref / 是否 tag / 是否当前提交」动态组合菜单项。
- **工具栏写入口**：针对「当前选中提交」提供精简按钮（新建分支 / tag）。
- **确认弹窗**：自绘 `gg-modal`（标题 + 命令展示 + 可选输入框 + 取消/确认），结果用 toast 提示，成功后 `load(path)` 刷新。
- **操作反馈**：成功 / 失败 / 冲突三态；冲突提示「请手动解决后刷新」。

## 三、B 块：检索与导航

1. **搜索过滤**（`useMemo` filter）：对 `subject + hash + author + authorEmail` 大小写不敏感匹配。
2. **键盘导航**：面板 `tabIndex` + `onKeyDown`，`↑`/`↓` 移动 `selected`，`Enter` 打开详情，`Esc` 清空选中。
3. **作者过滤下拉**：从 commits 提取唯一 author 一键筛选。
4. **计数显示**：`Showing N / total commits`，过滤时实时更新。

## 四、实施顺序

1. ~~阶段 1（纯前端）~~ — 按用户决策调至写操作之后。
2. **阶段 2（host 后端 + 基础写操作）**：`getStatus` + `checkout` + 分支增删改 + tag，配上确认弹窗骨架。
3. **阶段 3（进阶写操作）**：`merge` / `cherry-pick` / `revert` + 冲突反馈。
4. **阶段 4（高危操作）**：`reset`（先 soft/mixed，`--hard` 独立红色确认）+ `deleteRemoteBranch`。
5. **阶段 5（B 块）**：搜索过滤 + 键盘导航 + 作者下拉。

## 五、决策记录

- 写操作安全模式：**直接开放 + 每次确认**（不做整体只读开关）。
- 实施顺序：**先 A 块写操作，再做 B 块检索导航**。
- 规划落地：本文档。
