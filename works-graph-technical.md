# 「作品宇宙」知识图谱 · 技术方案文档

> 何媛个人主页（便当盒单页）06 格作品集知识图谱 —— 从手工 SVG 到 D3 v7 力导向 + HTML 软糖药丸的完整实现记录。
> 适用版本：v7（方案A）。核心源码：`src/components/home/WorksGraph.tsx`、`src/index.css`（`wf-*` 段）、`src/lib/works-data.ts`。

---

## 1. 需求演进（为什么最终是「方案A」）

| 轮次 | 用户反馈 / 目标 | 技术形态 |
| :--- | :--- | :--- |
| v1 | 06 格要「知识图谱」 | 手工 SVG 星系图（气泡链 + 光晕） |
| v2 | 太呆板，要交互 | SVG + 节点弹卡 + 漂浮呼吸 |
| v3 | 指定 **D3.js v7 力导向** | D3 force + SVG 圆形/胶囊节点 + 流动光点 |
| v4 | 字体太粗、气泡小于字体 | 收敛字重、getBBox 尺寸后置 |
| v5 | 还是很丑，找病因 | 归因：SVG 文本渲染生硬、硬彩线切割、长字塞爆圆、力导向破坏便当秩序感 |
| **v6（方案A）** | 按方案A重构 | **foreignObject 内嵌 HTML 软糖药丸 + 浅灰柔和曲线** |

**方案A 五条设计原则（对应 v5 诊断）**
1. 节点 = HTML `<div>`（原生抗锯齿、完整 Tailwind/阴影/圆角能力），不再用 SVG `<text>` 直接扛文字。
2. 连线 = 低饱和浅灰柔和曲线，仅 hover 时亮起分类主题色，不抢戏。
3. 叶子节点是可自适应宽度的小药丸（`width: max-content`），文字永不吞字。
4. 药丸 = 白底 + 细彩边 + 同色系浅彩光晕 + 墨灰字，hover 软糖弹起。
5. 保留力导向的弹性/拖拽/折叠，但用「固定分类方位 + 强向心」维持便当盒的秩序美感。

---

## 2. 技术选型

### 2.1 栈与依赖
- **框架**：React 18 + TypeScript + Vite；样式 Tailwind CSS + shadcn/ui。
- **图谱引擎**：`d3@^7`（forceSimulation / forceLink / forceManyBody / forceCollide / forceCenter / forceX / forceY / zoom / drag / transition）。选型理由：v7 原生 TypeScript 泛型支持好，force 体系成熟，SVG 输出与 DOM 操作直接，无需额外封装。
- **节点渲染**：SVG `foreignObject` + `xhtml:div`。在 SVG 里嵌入真实 HTML，获得浏览器原生字体渲染（font-smoothing / letter-spacing / 抗锯齿）与完整 CSS 能力。
- **状态**：React `useState` 管「详情卡弹窗」；图内瞬时状态（折叠集合、hover 聚焦）用闭包 `Set`/D3 class 切换，不进 React 状态（避免每帧重渲染）。
- **动效**：CSS transition + `@keyframes`（GPU 友好，仅 transform/opacity），流动光点用 SVG `animateMotion`（免 JS 逐帧驱动）。

### 2.2 关键技术决策
- **为什么节点用 foreignObject 而不是纯 SVG？**
  SVG `<text>` 没有 HTML 的复杂排版环境，浅色背景上容易显得干瘪、生硬、像旧动画文字；且「长文字塞进圆形」在几何上必然溢出。换成 HTML 药丸后，文字渲染品质、阴影、hover 弹性、自适应宽度全部开箱即用。
- **为什么连线常态是浅灰、hover 才亮彩色？**
  高饱和细彩线会把奶油底画布切割得凌乱（v4 截图主因）。降级为低饱和 `--sig-line` 浅灰后，图谱像一张干净的思维导图，hover 聚焦时才把该赛道「点亮」为主题色，层级与重点一目了然。
- **为什么文字量用 offsetWidth 实测，而不是估算字符数？**
  中文/英文/空格/`&` 的渲染宽度差异大，字符数估算不可靠。挂载后读 `offsetWidth/offsetHeight` 反写 `GNode.width/height`，既驱动 `forceCollide` 防重叠半径，又驱动 `foreignObject` 居中，一石二鸟。

---

## 3. 布局与几何参数

画布尺寸按容器宽自适应，所有几何量按画布高 `H` 归一（clamp 防极端）：

```ts
W   = wrap.clientWidth
H   = clamp(340, W * 0.58, 560)          // 画布高

GEO = {
  rootR:   h => clamp(36, h*0.085, 54),   // 根节点半径
  catH:    h => clamp(38, h*0.08, 48),    // 分类胶囊高
  catDist: h => clamp(120, h*0.28, 175),  // 根→分类 力臂 / 初始半径
  leafDist:h => clamp(95,  h*0.22, 135), // 分类→叶子 力臂 / 初始半径
}
```

**三层拓扑（1 root + 4 cat + N leaf = 10 节点 / 12 连线）**
- 根 `root`：固定于 `(W/2, H/2)`（`fx/fy` 锁死）。
- 分类 `cat-i`：初始方位角 `θ = -90° + i*90° - 22.5°`（四象限均分、整体逆时针偏 22.5°），按 `catDist` 极坐标布点。
- 叶子 `leaf-i-j`：相对父分类朝外展开，`θ_leaf = θ_cat + 180° + (j - (n-1)/2)*0.6rad`，按 `leafDist` 布点。

**数据 → 视觉映射（`works-data.ts`）**

| 字段 | 用途 |
| :--- | :--- |
| `cluster.tone` (tomato/peach/cream/plain) | 分类 + 叶子的边色、光晕色、连线 hover 色 |
| `cluster.shortTitle` | 图谱胶囊短标签（Kaggle / Agent / Vibecoding / MCP & Skill），防吞字 |
| `cluster.title` | 详情卡完整标题 |
| `node.status` (done/building) | 实线可点击 / 虚线弱化不可点击 |
| `node.platform` | tooltip 平台名 + 详情卡跳转 |

---

## 4. 力导向仿真参数

```ts
forceSimulation(nodes)
  .force("link",  forceLink(links)
                   .distance(l => l.ltype==="root-cat" ? GEO.catDist(H) : GEO.leafDist(H))
                   .strength(l => l.ltype==="root-cat" ? 1 : 0.85))
  .force("charge",  forceManyBody().strength(-720))     // 互斥，防聚集
  .force("center",  forceCenter(W/2, H/2))              // 整体向心
  .force("collide", forceCollide().radius(d => max(d.width,d.height)/2 + 18)) // 防重叠
  .force("x", forceX(W/2).strength(0.05))
  .force("y", forceY(H/2).strength(0.05))
```

- 根节点 `fx/fy` 锁中，不参与漂移；其余节点在「分类象限向心 + 全图向心 + 互斥 + 碰撞」下稳定成团。
- **稳定后自动居中（fit）**：仿真 `end` 时计算全节点 bbox → `scale = min(1.15, 0.9 / max(bw/W, bh/H))` → `zoomIdentity.translate(tx,ty).scale(k)`，650ms `easeCubicOut` 过渡；另有 2600ms 兜底定时器防 `end` 不触发。

---

## 5. 交互与动态行为

### 5.1 画布手势
- **缩放**：`d3.zoom().scaleExtent([0.5, 2.2])`，transform 作用于整图 `<g>`；桌面滚轮 / 移动端双指。
- **节点拖拽**：`d3.drag()`，`start` 时 `alphaTarget(0.25).restart()` 并记 `fx/fy`，`end` 释放回力导向；根节点禁拖。

### 5.2 折叠 / 展开
- 点击分类胶囊 → `collapsed Set<clusterId>` 切换 → `applyVisibility()` 隐藏该组叶子节点 + cat-leaf 连线 + 流动光点；箭头 `.wf-collapsed` 旋转 -90°；`sim.alpha(0.3).restart()` 让剩余节点重新归位。

### 5.3 分组聚焦（hover 高亮 / 其余虚化）
- hover 分类：`focusCluster(cid)` 给该组节点/连线/光点加 `.wf-bold`（连线亮主题色、加粗），其余加 `.wf-dim`（`opacity 0.16`）；根节点永不虚化。

### 5.4 点击叶子 → 详情卡
- `status !== "building"` 的叶子 → `openCard(cluster, node)` → React 状态弹 `WorkDialog`（类目徽章 + 项目背景 + 技术栈标签 + 截图占位 + 前往平台按钮）。`onLeafClick` 预留路由接口（可改 `navigate`）。

### 5.5 动效清单（全部 GPU 友好，prefers-reduced-motion 自动静止）

| 元素 | 动效 | 参数 |
| :--- | :--- | :--- |
| 根外发光 | `wf-pulse` 呼吸 | 3.6s ease-in-out，scale 1→1.15，opacity .28↔.52 |
| 分类药丸 | hover 软糖弹起 | `scale(1.06)`，0.18s `--sig-ease-bounce` cubic-bezier(.34,1.56,.64,1) |
| 叶子药丸 | hover 上浮 + 光晕扩大 | `translateY(-2px) scale(1.04)`，0.18s，光晕 0→6px |
| 折叠箭头 | 旋转 -90° | 0.25s bounce |
| 流动光点 | `animateMotion` 沿曲线 | root-cat 4.6s / cat-leaf 3.4s，r 2.4 / 1.7，随机 begin 0–3s |
| 分组聚焦 | 节点/连线/光点虚化 | `opacity → 0.16`，0.25s |
| 自动居中 | fit 过渡 | 650ms easeCubicOut |

### 5.6 响应式与降级
- **移动端 / 触摸设备**（`pointer: coarse`）：关闭流动光点（省性能），保留单指拖拽 + 双指缩放。
- **容器尺寸变化**：`ResizeObserver` 220ms 防抖，宽度变化 > 40px 时停止仿真、移除 SVG，由 React 重挂载重建。
- **`prefers-reduced-motion: reduce`**：根光晕等循环动画静止。
- **溢出防护**：`foreignObject { overflow: visible }` + 药丸 `max-width` 不限制（`width: max-content`），文字不吞字、不裁切。

---

## 6. 实现方案（分步）

1. **建图（幂等）**：effect 内 `d3.select(wrap).selectAll("*").remove()`，独占容器，避免重复挂载。
2. **渐变定义**：`radialGradient#wf-core-grad`（38%,32% / 75%，hsl(358 80% 66%) → hsl(358 76% 48%)）。
3. **数据建模**：遍历 `WORK_CLUSTERS` 生成 `GNode`（root/cat/leaf）与 `GLink`（root-cat/cat-leaf，带 tone/status/clusterId）。
4. **力导向**：上文章节 4 的 force 配置，`tick` 里更新 `g` 的 `transform` 与 `path` 的 `d`。
5. **连线渲染**：`path` + `linkCurve()`（root-cat 贝塞尔 / cat-leaf 圆弧），常态浅灰，hover `.wf-bold` 亮分类色。
6. **流动光点**：每条连线在 `<defs>` 克隆一条不可见 `path`，`circle + animateMotion` 引用，`data-cluster` 用于折叠/聚焦联动。
7. **节点渲染**：`foreignObject` 内嵌 `xhtml:div.wf-pill`（root 用渐变圆 + HTML 标题，cat 用大胶囊 + 箭头，leaf 用小药丸）。
8. **尺寸实测**：读 `offsetWidth/Height` → 反写 `GNode.width/height` + 重设 `foreignObject` 居中（驱动 collide 与 fit）。
9. **交互绑定**：drag / zoom / mouseenter·leave / click（折叠 + 弹卡）。
10. **生命周期清理**：`return () => { clearTimeout ×2; ro.disconnect(); sim.stop(); svg.remove(); tip.remove(); }` 防内存泄漏。

---

## 7. 核心参数速查表

### 7.1 几何 / 力导向
| 参数 | 值 |
| :--- | :--- |
| 画布 H | clamp(340, W×0.58, 560) |
| 根半径 rootR | clamp(36, H×0.085, 54) |
| 分类高 catH | clamp(38, H×0.08, 48) |
| 根↔分类距离 catDist | clamp(120, H×0.28, 175) |
| 分类↔叶子距离 leafDist | clamp(95, H×0.22, 135) |
| 电荷强度 charge | -720 |
| 碰撞半径 collide | max(w,h)/2 + 18 |
| 向心强度 x / y | 0.05 / 0.05 |
| 缩放范围 | 0.5 – 2.2 |
| 分类方位角 | -90° + i·90° - 22.5° |
| 叶子展开角 | θ_cat + 180° + (j-(n-1)/2)·0.6rad |
| fit 缩放上限 | 1.15，边距 70/50 |

### 7.2 视觉（CSS 变量均来自 sig-* 设计系统）
| 项 | 值 |
| :--- | :--- |
| 连线常态 | `--sig-line` 浅灰，1.4px（cat-leaf 1.1px / 0.62 透明度） |
| 连线 hover | 分类主题色，2.4px |
| 药丸底 / 边 | #FFFFFF / 1.5px 分类色 |
| 药丸圆角 | 999px（全圆角胶囊） |
| 分类字号 / 叶子字号 | 13px / 11.5px |
| 分类 padding | 0 22px；叶子 0 14px |
| 光晕 | 分类 5px、hover 6px 同色系 soft |
| 动效缓动 | `--sig-ease-bounce` cubic-bezier(.34,1.56,.64,1) |
| 文字色 | `--sig-ink` 墨灰（label）、`--sig-ink-soft`（弱化） |

---

## 8. 已知边界与后续
- **数据文案**：项目背景 / 技术架构为按仓库名推断的拟写占位，演示截图为占位块，待用户补真实内容。
- **路由扩展**：叶子点击当前弹 `WorkDialog`，`onLeafClick` 已预留 `navigate` 接口。
- **更多小工具**：占位节点（building）无 url，点击不弹卡，待补真实链接后改 `status: "done"`。

---

*文档生成于 2026-10-10，对应应用 v7（方案A）。*
