# MS2Int Web Server — 开发计划

## 概述

为 MS2Int 模型构建一个 Web 界面，用户可通过浏览器输入肽段序列及参数，在线预测碎片离子强度，并以交互式谱图展示结果。

---

## 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| **Backend** | FastAPI (Python) | 与 predict.py / PyTorch 同语言，可直接复用模型代码 |
| **Frontend** | React + Vite + TailwindCSS v4 | 现代 SPA，开发体验好，构建快 |
| **谱图渲染** | spectrum_utils (后端) | 专业质谱可视化库，支持 ProForma 注释、b/y ion 着色、mirror plot |
| **通信** | REST API (JSON + PNG) | 单条同步返回 JSON+图片；批量异步返回 job_id |
| **异步任务** | asyncio + 后台线程 | 批量推理异步执行，避免阻塞 API |
| **部署** | 单机 GPU 服务器 | 模型推理需要 CUDA |

---

## 两种使用模式

| 模式 | 入口 | 交互方式 | 输出 |
|------|------|---------|------|
| **Single (体验模式)** | 输入一条肽段序列 + 参数 | 同步，秒级返回 | 1 张谱图 (PNG) + 可展开离子表 |
| **Batch (批量模式)** | 上传 CSV/TSV 文件 | 异步，返回 job_id + 预估时间 | 稍后通过 job_id 下载结果 (H5/CSV) |

---

## 架构

```
┌──────────────────────────────────────────────────┐
│              React Frontend                       │
│  ┌─────────────┐  ┌───────────────────────────┐  │
│  │ Single Mode │  │ Batch Mode                │  │
│  │ PeptideForm │  │ CsvUpload → JobStatus     │  │
│  │ SpectrumImg │  │ JobHistory → Download     │  │
│  │ IonTable    │  │                           │  │
│  └──────┬──────┘  └──────────┬────────────────┘  │
│         │                    │                    │
│    POST /api/predict    POST /api/jobs/submit     │
│    (同步)               GET  /api/jobs/{id}       │
│         │                    │                    │
├─────────┴────────────────────┴───────────────────┤
│              FastAPI Backend                       │
│  ┌────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Predictor  │  │ Spectrum    │  │ Job Queue  │ │
│  │ (GPU Model)│  │ Renderer    │  │ (async)    │ │
│  │            │  │ (spec_utils)│  │            │ │
│  └────────────┘  └─────────────┘  └────────────┘ │
└──────────────────────────────────────────────────┘
```

---

## 目录结构

```
webserver/
├── PLAN.md                   # 本文件
├── backend/
│   ├── app.py                # FastAPI 主入口 + 路由
│   ├── predictor.py          # 模型加载 & 推理封装
│   ├── spectrum_render.py    # spectrum_utils 谱图渲染 → PNG
│   ├── ion_labels.py         # 离子标签 + 理论 m/z 计算
│   ├── job_manager.py        # 异步任务队列 (batch 模式)
│   ├── schemas.py            # Pydantic 请求/响应模型
│   ├── config.py             # 配置 (模型路径、GPU、job 存储)
│   ├── jobs/                 # 任务结果存储目录 (运行时生成)
│   └── requirements.txt      # Python 依赖
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    ├── src/
    │   ├── App.tsx            # 根组件 + Tab 路由
    │   ├── main.tsx           # 入口
    │   ├── api/
    │   │   └── client.ts      # API 调用封装
    │   ├── components/
    │   │   ├── Header.tsx           # 页面头部
    │   │   ├── SingleMode.tsx       # 单条预测页面
    │   │   ├── PeptideForm.tsx      # 肽段输入表单
    │   │   ├── SpectrumImage.tsx    # 谱图图片展示 (<img>)
    │   │   ├── IonTable.tsx         # 可展开离子表
    │   │   ├── BatchMode.tsx        # 批量上传页面
    │   │   ├── CsvUpload.tsx        # CSV 拖拽上传
    │   │   ├── JobStatus.tsx        # 任务状态 + 进度
    │   │   └── JobHistory.tsx       # 历史任务列表
    │   ├── types/
    │   │   └── index.ts       # TypeScript 类型
    │   └── styles/
    │       └── index.css      # Tailwind v4 入口 + @theme
    └── tsconfig.json
```

---

## 后端设计

### 1. 模型常驻 (predictor.py)

- 服务启动时加载模型到 GPU（`@app.lifespan`）
- 封装 `predict_single(peptide: dict) -> PredictionResult` 和 `predict_batch(df: DataFrame) -> ndarray`
- 复用 `MS2Int/` 下的 `preprocess.py`、`utils.py`、`model.py` 逻辑
- 输入验证：Length ≤ 30、Charge 1–6、collision_energy ∈ {10,20,23,25,26,27,28,29,30,35,40,42}、Fragmentation ∈ {HCD, CID}

### 2. 谱图渲染 (spectrum_render.py)

```python
import spectrum_utils.spectrum as sus
import spectrum_utils.plot as sup
import matplotlib.pyplot as plt

def render_spectrum_png(
    sequence: str,           # ProForma 格式, e.g. "ALLS[Phospho]LATHK"
    charge: int,
    predicted_intensities: np.ndarray,  # 模型输出的 29×31 矩阵
    theoretical_mz: np.ndarray,         # 理论 m/z 29×31 矩阵
) -> bytes:
    """
    用 spectrum_utils 生成标注谱图 PNG。
    1. 从 predicted_intensities + theoretical_mz 构建 MsmsSpectrum
    2. 用 annotate_proforma() 标注 b/y ions
    3. 调用 sup.spectrum() 渲染
    4. 返回 PNG bytes
    """
```

- 利用 `spectrum_utils.spectrum.MsmsSpectrum` 构建谱图对象
- `annotate_proforma(sequence, fragment_tol_mass, fragment_tol_mode, ion_types="by")`
- `spectrum_utils.plot.spectrum()` 生成 matplotlib Figure → 导出 PNG bytes
- 颜色自动: b 离子蓝、y 离子红 (spectrum_utils 默认配色)

### 3. 异步任务管理 (job_manager.py)

```python
class JobManager:
    jobs: dict[str, JobInfo]  # job_id → JobInfo

    def submit(self, csv_content: bytes, filename: str) -> JobInfo:
        """创建任务, 返回 job_id + 预估时间, 后台线程执行推理"""

    def get_status(self, job_id: str) -> JobInfo:
        """查询任务状态: pending/running/completed/failed"""

    def get_result(self, job_id: str) -> Path:
        """返回结果文件路径 (H5 或 CSV)"""
```

- 预估时间: `N_samples * 0.005s` (经验值, ~200 samples/sec on GPU)
- 结果存储: `backend/jobs/{job_id}/` 目录下
- 任务保留: 24h 后自动清理

### 4. API 端点 (app.py)

**Single 模式 (同步):**

| Method | Path | 描述 |
|--------|------|------|
| `POST` | `/api/predict` | 单条肽段预测, 返回 JSON (ions + spectrum_png base64) |
| `GET`  | `/api/health` | 健康检查 (模型是否就绪) |
| `GET`  | `/api/supported-modifications` | 返回支持的修饰列表 |

**Batch 模式 (异步):**

| Method | Path | 描述 |
|--------|------|------|
| `POST` | `/api/jobs/submit` | 上传 CSV/TSV, 返回 job_id + 预估时间 |
| `GET`  | `/api/jobs/{job_id}` | 查询任务状态 + 进度 |
| `GET`  | `/api/jobs/{job_id}/download` | 下载结果文件 (H5 或 CSV) |
| `GET`  | `/api/jobs` | 列出所有任务 (带分页) |

### 5. 请求/响应格式 (schemas.py)

**Single 请求:**
```json
{
  "sequence": "PEPTIDEK",
  "charge": 2,
  "collision_energy": 30,
  "fragmentation": "HCD"
}
```

**Single 响应:**
```json
{
  "sequence": "PEPTIDEK",
  "charge": 2,
  "collision_energy": 30,
  "fragmentation": "HCD",
  "length": 8,
  "spectrum_png": "<base64 encoded PNG>",
  "ions": [
    {"label": "b1", "mz": 98.06, "intensity": 0.05, "type": "b"},
    {"label": "y1", "mz": 147.11, "intensity": 0.85, "type": "y"}
  ]
}
```

**Batch Submit 响应:**
```json
{
  "job_id": "a1b2c3d4",
  "filename": "input.csv",
  "total_samples": 1500,
  "estimated_seconds": 7.5,
  "status": "pending",
  "created_at": "2025-01-15T10:30:00Z"
}
```

**Batch Status 响应:**
```json
{
  "job_id": "a1b2c3d4",
  "status": "running",
  "progress": 0.6,
  "processed": 900,
  "total": 1500,
  "elapsed_seconds": 4.2,
  "estimated_remaining_seconds": 2.8
}
```

### 6. 离子标签 + 理论 m/z (ion_labels.py)

- 输出矩阵 29×31 → 展开为带标签的离子列表
- b1–b29, b1²⁺–b29²⁺, y1–y29, y1²⁺–y29²⁺, 内部离子 m(start:end)
- 计算理论 m/z (复用 `spectrum_utils.proforma` 解析 + 氨基酸残基质量表)
- 过滤 intensity > 0 的离子返回前端

---

## UI 设计系统 — 像素风 (Pixel Art + Tailwind v4)

### 设计原则

- **8-bit 复古风**: 像素字体、直角边框、NES/SNES 风格配色
- **数据优先**: 谱图和数据仍占主视觉空间，像素风是装饰层
- **游戏感交互**: 按钮有按压效果 (box-shadow 位移)、hover 闪烁、8-bit 音效可选
- **无障碍**: 像素字体仅用于标题/装饰，正文使用等宽像素字体保证可读性

### 字体

```
Google Fonts:
- 标题/Logo: "Press Start 2P" (经典 8-bit 字体)
- 正文/数据: "VT323" (像素等宽，可读性好)
- 代码/序列: "Silkscreen" (紧凑像素风)
```

### 配色方案 — NES 调色板风格

```css
@import "tailwindcss";

@theme {
  /* 像素风字体 */
  --font-pixel-title: "Press Start 2P", monospace;
  --font-pixel-body: "VT323", monospace;
  --font-pixel-code: "Silkscreen", monospace;

  /* NES 风格配色 */
  --color-primary: #3040d0;           /* NES 蓝 */
  --color-primary-foreground: #fcfcfc; /* NES 白 */
  --color-primary-hover: #5060e0;

  --color-background: #f0f0e8;        /* 复古米白 (像老式显示器) */
  --color-foreground: #1a1a2e;        /* 深蓝黑 */

  --color-card: #fcfcfc;
  --color-card-foreground: #1a1a2e;

  --color-border: #888888;            /* 像素灰边框 */
  --color-border-light: #c0c0c0;
  --color-border-dark: #404040;

  --color-muted: #e8e8e0;
  --color-muted-foreground: #606060;

  --color-destructive: #d03030;       /* NES 红 */
  --color-success: #30a030;           /* NES 绿 */
  --color-warning: #e8a020;           /* NES 黄 */

  /* 谱图专用色 — 8-bit 风格 */
  --color-ion-b: #3070f0;             /* b 离子 — 像素蓝 */
  --color-ion-y: #e03030;             /* y 离子 — 像素红 */
  --color-ion-internal: #909090;      /* 内部离子 — 像素灰 */

  /* 无圆角 — 像素风核心特征 */
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
}

@custom-variant dark (&:where(.dark, .dark *));

.dark {
  --color-background: #0a0a1a;        /* 深空蓝黑 */
  --color-foreground: #e0e0d0;
  --color-card: #14142a;
  --color-card-foreground: #e0e0d0;
  --color-border: #505070;
  --color-border-light: #606080;
  --color-border-dark: #303050;
  --color-muted: #1a1a30;
  --color-muted-foreground: #8080a0;
}
```

### 像素边框系统 (CSS box-shadow)

```css
/* 3D 凸起边框 — 用于 Card、Input */
@utility pixel-border-raised {
  border: 3px solid var(--color-border);
  box-shadow:
    inset -3px -3px 0 0 var(--color-border-dark),
    inset 3px 3px 0 0 var(--color-border-light);
}

/* 3D 凹陷边框 — 用于 Input focus、按下态 */
@utility pixel-border-inset {
  border: 3px solid var(--color-border);
  box-shadow:
    inset 3px 3px 0 0 var(--color-border-dark),
    inset -3px -3px 0 0 var(--color-border-light);
}

/* 像素阴影 — 用于按钮 */
@utility pixel-shadow {
  box-shadow: 4px 4px 0 0 var(--color-border-dark);
}

/* 按钮按压效果 */
@utility pixel-shadow-pressed {
  box-shadow: 2px 2px 0 0 var(--color-border-dark);
  transform: translate(2px, 2px);
}
```

### 依赖库

**后端 (requirements.txt):**

| 库 | 用途 |
|----|------|
| `fastapi` + `uvicorn` | Web 框架 + ASGI 服务器 |
| `spectrum_utils[iplot]` | 谱图渲染 (matplotlib backend) |
| `torch` + `mamba_ssm` | 模型推理 |
| `h5py` + `pandas` + `numpy` | 数据处理 |
| `pydantic` v2 | 请求/响应校验 |
| `python-multipart` | 文件上传 |

**前端 (package.json):**

| 库 | 用途 |
|----|------|
| `tailwindcss` v4 | CSS-first 样式 |
| `class-variance-authority` (CVA) | 组件变体管理 |
| `clsx` + `tailwind-merge` | className 合并 |
| `react-dropzone` | 文件拖拽上传 |
| Google Fonts | Press Start 2P / VT323 / Silkscreen |

### 页面布局

#### Single 模式 (体验模式)

```
╔══════════════════════════════════════════════════════╗
║  ★ MS2Int ★                          [☀/☾] [GitHub] ║
║  ═══ Spectrum Prediction Tool ═══                    ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  ┌─[▸ SINGLE]─┬─[ BATCH ]─┐                         ║
║  │                                                   ║
║  │  ╔═══ INPUT ══════════════════════════════════╗   ║
║  │  ║  SEQUENCE:                                 ║   ║
║  │  ║  ┌──────────────────────────────────────┐  ║   ║
║  │  ║  │ PEPTIDEK_                            │  ║   ║
║  │  ║  └──────────────────────────────────────┘  ║   ║
║  │  ║                                            ║   ║
║  │  ║  CHG:[2▾]  CE:[30▾]  FRAG:[■HCD][□CID]    ║   ║
║  │  ║                                            ║   ║
║  │  ║        ╔══════════════════╗                 ║   ║
║  │  ║        ║  ▶ PREDICT !!   ║                 ║   ║
║  │  ║        ╚══════════════════╝                 ║   ║
║  │  ╚════════════════════════════════════════════╝   ║
║  │                                                   ║
║  │  ╔═══ SPECTRUM ═══════════════════════════════╗   ║
║  │  ║                                            ║   ║
║  │  ║  ┌────────────────────────────────────┐    ║   ║
║  │  ║  │                                    │    ║   ║
║  │  ║  │   <img> spectrum_utils 渲染的       │    ║   ║
║  │  ║  │   带标注的质谱图 (PNG)              │    ║   ║
║  │  ║  │   b ions = 蓝, y ions = 红         │    ║   ║
║  │  ║  │                                    │    ║   ║
║  │  ║  └────────────────────────────────────┘    ║   ║
║  │  ║                                            ║   ║
║  │  ╚════════════════════════════════════════════╝   ║
║  │                                                   ║
║  │  ╔═══ ION TABLE (▾ expand) ═══════════════════╗   ║
║  │  ║  ION  │ M/Z    │ INT   │ TYPE              ║   ║
║  │  ║  b1   │ 98.06  │ 0.05  │ ■ b               ║   ║
║  │  ║  y1   │ 147.11 │ 0.85  │ ■ y               ║   ║
║  │  ║  ...  │ ...    │ ...   │ ...               ║   ║
║  │  ╚════════════════════════════════════════════╝   ║
║  └───────────────────────────────────────────────────╝
╠══════════════════════════════════════════════════════╣
║  MS2Int © 2025 │ Powered by Mamba2 │ ★★★            ║
╚══════════════════════════════════════════════════════╝
```

#### Batch 模式 (批量模式)

```
╔══════════════════════════════════════════════════════╗
║  ★ MS2Int ★                          [☀/☾] [GitHub] ║
║  ═══ Spectrum Prediction Tool ═══                    ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  ┌─[ SINGLE ]─┬─[▸ BATCH ]─┐                        ║
║  │                                                   ║
║  │  ╔═══ UPLOAD CSV/TSV ════════════════════════╗    ║
║  │  ║  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ║    ║
║  │  ║  │                                     │  ║    ║
║  │  ║  │    DROP CSV/TSV FILE HERE           │  ║    ║
║  │  ║  │    or click to browse               │  ║    ║
║  │  ║  │                                     │  ║    ║
║  │  ║  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  ║    ║
║  │  ║                                           ║    ║
║  │  ║  FILE: input.csv (1500 rows)              ║    ║
║  │  ║  PREVIEW:                                 ║    ║
║  │  ║  │ Sequence       │ Chg │ CE │ Frag │     ║    ║
║  │  ║  │ PEPTIDEK       │ 2   │ 30 │ HCD  │     ║    ║
║  │  ║  │ ALLS[Phospho]… │ 3   │ 27 │ HCD  │     ║    ║
║  │  ║                                           ║    ║
║  │  ║        ╔══════════════════╗                ║    ║
║  │  ║        ║  ▶ SUBMIT JOB   ║                ║    ║
║  │  ║        ╚══════════════════╝                ║    ║
║  │  ╚═══════════════════════════════════════════╝    ║
║  │                                                   ║
║  │  ╔═══ JOB SUBMITTED ════════════════════════╗     ║
║  │  ║  JOB ID:    a1b2c3d4                     ║     ║
║  │  ║  SAMPLES:   1500                         ║     ║
║  │  ║  EST. TIME: ~8 sec                       ║     ║
║  │  ║  STATUS:    [████████░░] 80% RUNNING     ║     ║
║  │  ╚══════════════════════════════════════════╝     ║
║  │                                                   ║
║  │  ╔═══ JOB HISTORY ═════════════════════════╗      ║
║  │  ║  ID       │ FILE      │ STATUS │ ACTION ║      ║
║  │  ║  a1b2c3d4 │ input.csv │ ✓ DONE │ [↓]   ║      ║
║  │  ║  e5f6g7h8 │ test.tsv  │ RUNNING│ [···] ║      ║
║  │  ╚═════════════════════════════════════════╝      ║
║  └───────────────────────────────────────────────────╝
╠══════════════════════════════════════════════════════╣
║  MS2Int © 2025 │ Powered by Mamba2 │ ★★★            ║
╚══════════════════════════════════════════════════════╝
```

### 组件规格

#### Button (CVA) — 像素按钮

```
┌──────────────────┐
│   ▶ PREDICT !!   │  ← 凸起态 (pixel-shadow)
└──────────────────┘

  ┌──────────────────┐
  │   ▶ PREDICT !!   │  ← 按压态 (pixel-shadow-pressed, translate 2px)
  └──────────────────┘
```

| Variant | 样式 | 用途 |
|---------|------|------|
| `default` | `bg-primary text-primary-foreground pixel-shadow` | Predict 主按钮 |
| `outline` | `border-3 border-border bg-card` | 次要操作 |
| `ghost` | `hover:bg-muted` | Tab 切换等 |
| `destructive` | `bg-destructive text-white pixel-shadow` | 清除/重置 |

| Size | 尺寸 |
|------|------|
| `sm` | `h-8 px-3 text-xs font-pixel-body` |
| `default` | `h-10 px-5 text-sm font-pixel-body` |
| `lg` | `h-12 px-8 text-base font-pixel-title` |

按钮交互:
- Hover: 轻微亮度提升 (`brightness-110`)
- Active: `pixel-shadow-pressed` (阴影缩短 + 位移 2px)
- Disabled: `opacity-50 cursor-not-allowed`, 无阴影

#### Input — 像素输入框

- 基础: `h-10 border-3 border-border bg-card px-3 font-pixel-body text-sm pixel-border-inset`
- Focus: `border-primary` (边框变蓝)
- Error: `border-destructive` + 下方红色像素文字
- Placeholder: `text-muted-foreground` (闪烁光标效果可选)

#### Select — 像素下拉

- Trigger: 与 Input 同风格 + 右侧 `▾` 箭头
- Content: `bg-card border-3 border-border pixel-border-raised`
- Item hover: `bg-primary text-primary-foreground` (整行高亮，类似游戏菜单)
- Active item: 左侧加 `▶` 指示符

#### Card — 像素面板

- `border-3 border-border bg-card pixel-border-raised`
- Header: `px-4 py-3 border-b-3 border-border bg-muted font-pixel-title text-xs uppercase tracking-wider`
- Content: `p-4`

#### Tab — 像素标签

- Active: `bg-card border-3 border-border border-b-0 font-pixel-body text-primary` (底部与内容区融合)
- Inactive: `bg-muted text-muted-foreground border-3 border-border`
- 效果: 类似老式文件夹标签

### 谱图展示 — spectrum_utils (后端渲染)

谱图**不使用像素风格**，而是直接使用 `spectrum_utils` 生成的学术级 PNG 图片。

```
spectrum_utils.plot.spectrum() 配置:
├── 渲染引擎: matplotlib (后端 Agg, headless)
├── 输出: PNG bytes → base64 编码传给前端
├── b 离子: 蓝色 (spectrum_utils 默认)
├── y 离子: 红色 (spectrum_utils 默认)
├── 标注: ion_types="by", 峰上标注离子名
├── 图片尺寸: figsize=(12, 6), dpi=150
├── 背景: 白色 (固定, 不跟随暗色主题)
└── 前端展示: <img src="data:image/png;base64,..." />
```

前端 `SpectrumImage.tsx` 组件:
- 直接用 `<img>` 标签展示 base64 PNG
- 像素面板包裹: `pixel-border-raised` 外框
- 无交互 (缩放/hover 不需要, spectrum_utils 图片已包含标注)
- 可右键另存为 PNG

### 装饰元素

- **Logo**: "★ MS2Int ★", 用 Press Start 2P 字体
- **分隔线**: `═══` 双线字符
- **Loading**: 像素进度条 `[████████░░] 80%`，或 8-bit 旋转动画
- **成功提示**: `✓ QUEST COMPLETE!` 风格
- **错误提示**: `✗ ERROR! Invalid sequence` 红色像素框
- **空状态**: "Press PREDICT to start your quest!" + 小像素分子图标

### 响应式断点

| 断点 | 宽度 | 布局 |
|------|------|------|
| `sm` | ≥640px | 表单一列，像素字体缩小 |
| `md` | ≥768px | 参数行横向排列 |
| `lg` | ≥1024px | 谱图区域更大 |
| `xl` | ≥1280px | 最大容器宽 `max-w-5xl` |

---

## 前端组件详细设计

### Single 模式组件

#### 1. PeptideForm — 肽段输入

- **Sequence**: 全宽像素输入框, `font-pixel-code`, placeholder=`ENTER PEPTIDE SEQUENCE...`
- **参数行** (md 断点后横向排列):
  - CHG: 像素 Select (1–6), `font-pixel-body`, hover 时 `▶` 指示
  - CE: 像素 Select (10, 20, 23, 25, 26, 27, 28, 29, 30, 35, 40, 42)
  - FRAG: 像素切换按钮组 `[■HCD] [□CID]`, 选中态 `bg-primary text-white`
- **Predict 按钮**: `variant=default size=lg font-pixel-title`, 文字 `▶ PREDICT !!`
- **Loading 状态**: 像素进度条 `[████░░░░░░] PREDICTING...`
- **错误提示**: `✗ ERROR!` 红色像素框 (`bg-destructive/10 border-3 border-destructive`)

#### 2. SpectrumImage — 谱图展示

- `<img>` 标签, `src="data:image/png;base64,{spectrum_png}"`
- 外层: 像素面板 `pixel-border-raised`, 标题 `═══ SPECTRUM ═══`
- 图片宽度: `w-full max-w-3xl`
- 预测前: 空状态文字 `"Press PREDICT to start your quest!"`
- 预测后: 显示 spectrum_utils 渲染的带标注质谱图 (学术风格, 非像素风)

#### 3. IonTable — 可展开离子表

- 默认折叠, 点击 `▾ ION TABLE` 标题展开
- **像素表格头**: `bg-muted border-3 border-border font-pixel-title text-xs uppercase`
- **列**: ION, M/Z, INTENSITY, TYPE
- **TYPE 列**: 带颜色块 `■` (b=蓝, y=红, internal=灰)
- **排序**: 默认按 intensity 降序
- 仅显示 intensity > 0 的离子

### Batch 模式组件

#### 4. CsvUpload — CSV/TSV 上传

- **拖拽区**: `react-dropzone`, 像素虚线边框 `border-3 border-dashed border-border`, 内置文字 `DROP CSV/TSV FILE HERE`
- **文件预览**: 上传后展示文件名 + 行数 + 前 3 行像素表格
- **Submit 按钮**: `▶ SUBMIT JOB`, pixel-shadow

#### 5. JobStatus — 任务状态卡

- 提交后立即显示
- **字段**: JOB ID, SAMPLES (总条数), EST. TIME (~N sec), STATUS
- **进度条**: 像素进度条 `[████████░░] 80% RUNNING`
- **轮询**: 每 2s 调用 `GET /api/jobs/{job_id}` 更新进度
- **完成态**: `✓ QUEST COMPLETE!` + `[↓ DOWNLOAD]` 按钮
- **失败态**: `✗ ERROR!` + 错误信息

#### 6. JobHistory — 历史任务列表

- 像素表格列出所有提交过的任务
- **列**: ID (短), FILE, SAMPLES, STATUS, ACTION
- **STATUS**: `PENDING` / `RUNNING` / `✓ DONE` / `✗ FAILED`
- **ACTION**: 完成 → `[↓]` 下载按钮; 运行中 → `[···]` 动画
- 任务列表存储在 localStorage (页面刷新不丢失)

### 公共组件

#### 7. Header

- **左**: `★ MS2Int ★` (font-pixel-title, 带微弱闪烁动画可选)
- **副标题**: `═══ Spectrum Prediction Tool ═══` (font-pixel-body, text-muted-foreground)
- **右**: `[☀/☾]` 暗色切换 + `[GH]` GitHub 链接, 均为像素按钮 ghost variant

#### 8. Tab 导航

- 两个标签: `[▸ SINGLE]` / `[▸ BATCH]`
- 像素标签风格, active 底部与内容区融合
- 切换时保留各自状态 (不重置表单/任务列表)

---

## 实施步骤

### Phase 1: 后端 — Single 模式

1. 创建 `backend/config.py` — 模型路径、GPU 等配置
2. 创建 `backend/predictor.py` — 封装模型加载 + 单条/批量推理
3. 创建 `backend/ion_labels.py` — 离子标签 + 理论 m/z 计算
4. 创建 `backend/spectrum_render.py` — spectrum_utils 谱图渲染
5. 创建 `backend/schemas.py` — Pydantic 请求/响应模型
6. 创建 `backend/app.py` — FastAPI `/api/predict` 同步端点
7. 创建 `backend/requirements.txt`
8. 验证: curl 调用 `/api/predict` 返回 ions + spectrum_png

### Phase 2: 后端 — Batch 模式

1. 创建 `backend/job_manager.py` — 异步任务队列
2. 实现 `/api/jobs/submit` — CSV 上传 + 预估时间
3. 实现 `/api/jobs/{job_id}` — 状态查询 + 进度
4. 实现 `/api/jobs/{job_id}/download` — 结果下载
5. 实现 `/api/jobs` — 任务列表
6. 验证: 上传 CSV → 获取 job_id → 轮询完成 → 下载

### Phase 3: 前端 — Single 模式

1. 初始化 Vite + React + TypeScript + TailwindCSS v4
2. 像素风 CSS 主题 (@theme + @utility)
3. Header + Tab 导航
4. PeptideForm 组件
5. SpectrumImage 组件 (base64 PNG 展示)
6. IonTable 组件 (可折叠)
7. 连通: 表单提交 → API → 谱图 + 离子表

### Phase 4: 前端 — Batch 模式

1. CsvUpload 组件 (react-dropzone + 预览)
2. JobStatus 组件 (进度轮询)
3. JobHistory 组件 (localStorage 持久化)
4. 下载功能
5. 连通: 上传 → submit → 轮询 → 下载

### Phase 5: 打磨 & 部署

1. 错误处理 + 输入校验提示 (像素风 toast)
2. Loading 状态 (像素进度条)
3. 响应式布局适配
4. 暗色模式
5. README + 启动脚本 (`start.sh`)

### Phase 6: Playwright E2E 自动化测试

> 用于远程服务器上自动验证前后端功能完整性。headless 模式运行，无需 GUI。

#### 6.1 测试环境配置

```
webserver/frontend/
├── playwright.config.ts          # Playwright 配置
├── tests/
│   ├── single-mode.spec.ts       # Single 模式测试
│   ├── batch-mode.spec.ts        # Batch 模式测试
│   ├── api-health.spec.ts        # API 健康检查
│   └── pages/
│       ├── SingleModePage.ts     # Page Object: Single 页面
│       └── BatchModePage.ts      # Page Object: Batch 页面
```

**playwright.config.ts 关键配置:**

| 配置项 | 值 | 说明 |
|--------|----|------|
| `testDir` | `./tests` | 测试文件目录 |
| `baseURL` | `http://localhost:5173` | 前端 dev server |
| `projects` | `chromium` only | 远程服务器无需多浏览器 |
| `webServer[0]` | `uvicorn app:app --port 8000` | 自动启动后端 |
| `webServer[1]` | `npm run dev -- --port 5173` | 自动启动前端 |
| `retries` | 1 | 失败重试一次 |
| `trace` | `on-first-retry` | 失败时记录 trace |
| `screenshot` | `only-on-failure` | 失败时自动截图 |
| `timeout` | 30000 | 推理可能需要较长时间 |

#### 6.2 测试用例设计

##### Test Suite 1: API 健康检查 (`api-health.spec.ts`)

| 用例 | 验证点 |
|------|--------|
| GET /api/health | `status=ok`, `model_loaded=true`, `device` 包含 `cuda` |
| GET /api/supported-modifications | 返回非空数组, 包含 `M[Oxidation]`, `C[Carbamidomethyl]` |

##### Test Suite 2: Single 模式 (`single-mode.spec.ts`)

| 用例 | 操作 | 验证点 |
|------|------|--------|
| **默认预测** | 保留默认值 PEPTIDEK/2+/30/HCD → 点击 PREDICT | 谱图 PNG 可见 + 离子表显示 + 行数 >0 |
| **修饰肽段** | 输入 `[Acetyl]-ALLS[Phospho]LATHK`, 3+, 25, HCD | 谱图标题包含序列 + 离子表有 b/y ions |
| **CID 碎裂** | PEPTIDEK, 2+, 30, CID | 返回成功 + 谱图可见 |
| **所有电荷值** | 遍历 charge 1–6 | 每个电荷值都返回结果不报错 |
| **所有 CE 值** | 遍历所有 12 个 CE | 每个 CE 都返回结果不报错 |
| **空序列** | 清空输入框 → 点击 PREDICT | 按钮 disabled, 不发请求 |
| **无效序列** | 输入 `123!!!` | 显示 ERROR 提示 |
| **超长序列** | 输入 31 个氨基酸 | 显示长度超限错误 |
| **离子表折叠** | 预测后点击 SHOW ALL / COLLAPSE | 表格展开/折叠状态切换 |
| **离子类型过滤** | 点击 b / y / ALL 过滤按钮 | 表格行数正确变化 |

##### Test Suite 3: Batch 模式 (`batch-mode.spec.ts`)

| 用例 | 操作 | 验证点 |
|------|------|--------|
| **CSV 上传** | 切换到 BATCH tab → 上传有效 CSV | 显示 JobStatus 卡片 + job_id |
| **进度轮询** | 上传后等待 | 进度条从 0 → 100%, 状态变为 COMPLETED |
| **结果下载** | 任务完成后点击 DOWNLOAD H5 | 响应 200 + Content-Type 包含 octet-stream |
| **任务历史** | 提交多个任务 | JobHistory 列表显示所有任务, 点击可切换查看 |
| **无效文件** | 上传 .txt 文件 | 提示仅支持 CSV/TSV |
| **Tab 切换保留** | Single 预测后切到 Batch 再切回 | Single 结果仍在 |

#### 6.3 Page Object Model

```typescript
// tests/pages/SingleModePage.ts
class SingleModePage {
  // Locators
  readonly sequenceInput;     // pixel-input for peptide
  readonly chargeSelect;      // pixel-select for charge
  readonly ceSelect;          // pixel-select for CE
  readonly fragSelect;        // pixel-select for fragmentation
  readonly predictButton;     // pixel-btn PREDICT
  readonly spectrumImage;     // img in SpectrumImage card
  readonly ionTable;          // table in IonTable card
  readonly errorCard;         // ERROR card
  readonly filterButtons;     // type filter buttons (ALL/b/y/...)
  readonly expandButton;      // SHOW ALL / COLLAPSE

  // Actions
  async fillForm(seq, charge, ce, frag);
  async predict();
  async waitForResult();
  async getIonCount();
  async filterByType(type);
  async toggleExpand();
}

// tests/pages/BatchModePage.ts
class BatchModePage {
  readonly dropZone;          // drag-drop upload area
  readonly fileInput;         // hidden file input
  readonly submitButton;      // SUBMIT BATCH JOB
  readonly jobStatusCard;     // JobStatus component
  readonly progressBar;       // pixel-progress-bar
  readonly downloadButton;    // DOWNLOAD H5 link
  readonly jobHistory;        // JobHistory list
  readonly statusBadge;       // status badge (PENDING/RUNNING/COMPLETED)

  async uploadFile(filePath);
  async waitForCompletion(timeout);
  async getProgress();
  async clickDownload();
  async selectJob(jobId);
}
```

#### 6.4 测试数据

```
webserver/frontend/tests/fixtures/
├── valid_3rows.csv       # 3 行有效数据 (快速测试)
├── valid_20rows.csv      # 20 行数据 (进度条测试)
├── invalid_columns.csv   # 缺少必需列
└── empty.csv             # 空文件
```

**valid_3rows.csv 示例:**
```csv
Sequence,Charge,collision_energy,Fragmentation
PEPTIDEK,2,30,HCD
ACDEFGHIK,3,25,HCD
LMNPQRSTVWY,2,35,CID
```

#### 6.5 运行命令

```bash
# 安装 Playwright + 浏览器 (首次)
cd webserver/frontend
npm install -D @playwright/test
npx playwright install chromium

# 运行全部测试 (headless, 自动启动前后端)
npx playwright test

# 运行指定 suite
npx playwright test tests/single-mode.spec.ts
npx playwright test tests/batch-mode.spec.ts

# 带 UI 调试 (仅本地)
npx playwright test --ui

# 查看测试报告
npx playwright show-report

# 失败时查看 trace
npx playwright show-trace test-results/*/trace.zip
```

#### 6.6 实施步骤

1. `npm install -D @playwright/test` + `npx playwright install chromium`
2. 创建 `playwright.config.ts` (双 webServer 配置)
3. 创建测试 fixtures (CSV 文件)
4. 实现 Page Object: `SingleModePage.ts`, `BatchModePage.ts`
5. 实现 `api-health.spec.ts` (最简单, 先跑通)
6. 实现 `single-mode.spec.ts` (核心功能)
7. 实现 `batch-mode.spec.ts` (异步流程)
8. 验证: `npx playwright test` 全部通过
9. (可选) 添加到 CI/CD 或 cron 定时执行

---

## 关键约束

- **模型参数**: d_model=512, n_layer=4, Mamba2 架构
- **最大肽段长度**: 30 个氨基酸
- **电荷范围**: 1–6
- **碰撞能量离散值**: 10, 20, 23, 25, 26, 27, 28, 29, 30, 35, 40, 42
- **碎裂方式**: HCD, CID
- **输出维度**: 29 × 31 (离子位置 × 离子类型)
- **GPU**: 推理需要 CUDA，模型常驻显存约 ~50MB

---

## Phase 6: E2E 自动化测试 — Playwright

### 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| **框架** | Playwright Test | 自动等待、跨浏览器、网络拦截、内置 runner |
| **语言** | TypeScript | 与前端统一 |
| **浏览器** | Chromium (主) + Firefox (辅) | Chromium 覆盖 Chrome/Edge，Firefox 覆盖兼容性 |
| **模式** | API Mock + 真实后端双模式 | Mock 模式用于 CI/快速迭代，真实模式用于集成验证 |

### 目录结构

```
frontend/
├── playwright.config.ts          # Playwright 配置
├── tests/
│   ├── fixtures/
│   │   └── test-base.ts          # 自定义 fixture (mock API)
│   ├── pages/
│   │   ├── SingleModePage.ts     # Single 模式 Page Object
│   │   └── BatchModePage.ts      # Batch 模式 Page Object
│   ├── mocks/
│   │   └── api-handlers.ts       # API mock 响应数据
│   ├── single-mode.spec.ts       # Single 模式测试
│   ├── batch-mode.spec.ts        # Batch 模式测试
│   ├── navigation.spec.ts        # 导航 + Header 测试
│   └── visual.spec.ts            # 视觉回归测试
└── test-results/                 # 运行时生成 (gitignore)
```

### 配置

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on',                    // 每次录制 trace (Trace Viewer 逐步回放)
    video: 'on',                    // 每次录制 webm 视频
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
```

### API Mock 数据

```typescript
// tests/mocks/api-handlers.ts

export const MOCK_PREDICT_RESPONSE = {
  sequence: "PEPTIDEK",
  charge: 2,
  collision_energy: 30,
  fragmentation: "HCD",
  length: 8,
  spectrum_png: "<base64 1x1 PNG placeholder>",
  ions: [
    { label: "b1", mz: 98.0600, intensity: 0.0500, type: "b" },
    { label: "y1", mz: 147.1128, intensity: 0.8500, type: "y" },
    { label: "y2", mz: 275.1714, intensity: 0.6200, type: "y" },
    { label: "b2", mz: 227.1026, intensity: 0.3100, type: "b" },
    { label: "y3", mz: 388.2554, intensity: 0.4800, type: "y" },
  ],
};

export const MOCK_JOB_SUBMIT_RESPONSE = {
  job_id: "test-job-001",
  filename: "test_input.csv",
  total_samples: 100,
  estimated_seconds: 0.5,
  status: "pending",
  created_at: "2025-01-15T10:30:00Z",
};

export const MOCK_JOB_STATUS_RUNNING = {
  job_id: "test-job-001",
  status: "running",
  progress: 0.6,
  processed: 60,
  total: 100,
  elapsed_seconds: 0.3,
  estimated_remaining_seconds: 0.2,
  error: null,
  filename: "test_input.csv",
  created_at: "2025-01-15T10:30:00Z",
};

export const MOCK_JOB_STATUS_COMPLETED = {
  ...MOCK_JOB_STATUS_RUNNING,
  status: "completed",
  progress: 1.0,
  processed: 100,
  elapsed_seconds: 0.5,
  estimated_remaining_seconds: 0,
};

export const MOCK_HEALTH = {
  status: "ok",
  model_loaded: true,
  device: "cuda:0",
};
```

### Page Objects

```typescript
// tests/pages/SingleModePage.ts
import { Page, Locator } from '@playwright/test';

export class SingleModePage {
  readonly page: Page;
  readonly singleTab: Locator;
  readonly sequenceInput: Locator;
  readonly chargeSelect: Locator;
  readonly ceSelect: Locator;
  readonly fragSelect: Locator;
  readonly predictButton: Locator;
  readonly spectrumImage: Locator;
  readonly ionTable: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.singleTab = page.locator('.pixel-tab', { hasText: 'SINGLE' });
    this.sequenceInput = page.locator('.pixel-input');
    this.chargeSelect = page.locator('.pixel-select').first();
    this.ceSelect = page.locator('.pixel-select').nth(1);
    this.fragSelect = page.locator('.pixel-select').nth(2);
    this.predictButton = page.locator('.pixel-btn-primary', { hasText: /PREDICT/ });
    this.spectrumImage = page.locator('img[alt*="spectrum"]');
    this.ionTable = page.locator('table');
    this.errorMessage = page.locator('text=ERROR').locator('..');
  }

  async goto() {
    await this.page.goto('/');
    await this.singleTab.click();
  }

  async fillForm(params: {
    sequence?: string;
    charge?: string;
    ce?: string;
    frag?: string;
  }) {
    if (params.sequence !== undefined) {
      await this.sequenceInput.clear();
      await this.sequenceInput.fill(params.sequence);
    }
    if (params.charge) await this.chargeSelect.selectOption(params.charge);
    if (params.ce) await this.ceSelect.selectOption(params.ce);
    if (params.frag) await this.fragSelect.selectOption(params.frag);
  }

  async predict() {
    await this.predictButton.click();
  }
}
```

```typescript
// tests/pages/BatchModePage.ts
import { Page, Locator } from '@playwright/test';

export class BatchModePage {
  readonly page: Page;
  readonly batchTab: Locator;
  readonly dropZone: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly jobStatus: Locator;
  readonly jobHistory: Locator;
  readonly downloadButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.batchTab = page.locator('.pixel-tab', { hasText: 'BATCH' });
    this.dropZone = page.locator('.border-dashed');
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.locator('.pixel-btn-primary', { hasText: /SUBMIT/ });
    this.jobStatus = page.locator('text=JOB:').locator('..');
    this.jobHistory = page.locator('text=JOB HISTORY').locator('..');
    this.downloadButton = page.locator('a', { hasText: 'DOWNLOAD' });
    this.errorMessage = page.locator('text=ERROR').locator('..');
  }

  async goto() {
    await this.page.goto('/');
    await this.batchTab.click();
  }

  async uploadFile(filePath: string) {
    await this.fileInput.setInputFiles(filePath);
  }

  async submit() {
    await this.submitButton.click();
  }
}
```

### 测试用例设计

#### 1. navigation.spec.ts — 导航与 Header

```typescript
test.describe('Navigation & Header', () => {
  test('页面加载 — 标题、Header、默认 Tab', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MS2Int/);
    await expect(page.locator('text=★ MS2Int ★')).toBeVisible();
    await expect(page.locator('.pixel-tab-active')).toContainText('SINGLE');
  });

  test('Tab 切换 — Single ↔ Batch', async ({ page }) => {
    await page.goto('/');
    // 默认 Single
    await expect(page.locator('text=PEPTIDE SEQUENCE')).toBeVisible();
    // 切换到 Batch
    await page.locator('.pixel-tab', { hasText: 'BATCH' }).click();
    await expect(page.locator('text=UPLOAD CSV')).toBeVisible();
    // 切回 Single
    await page.locator('.pixel-tab', { hasText: 'SINGLE' }).click();
    await expect(page.locator('text=PEPTIDE SEQUENCE')).toBeVisible();
  });

  test('暗色模式切换', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);
    await page.locator('button[title="Toggle dark mode"]').click();
    await expect(html).toHaveClass(/dark/);
    await page.locator('button[title="Toggle dark mode"]').click();
    await expect(html).not.toHaveClass(/dark/);
  });

  test('GitHub 链接存在且 target=_blank', async ({ page }) => {
    await page.goto('/');
    const ghLink = page.locator('a[title="GitHub"]');
    await expect(ghLink).toHaveAttribute('target', '_blank');
  });
});
```

#### 2. single-mode.spec.ts — Single 模式核心流程

```typescript
test.describe('Single Mode — Mock API', () => {
  test.beforeEach(async ({ page }) => {
    // Mock /api/predict
    await page.route('**/api/predict', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PREDICT_RESPONSE),
      })
    );
    await page.goto('/');
  });

  test('默认表单值正确', async ({ page }) => {
    const sp = new SingleModePage(page);
    await expect(sp.sequenceInput).toHaveValue('PEPTIDEK');
    await expect(sp.chargeSelect).toHaveValue('2');
    await expect(sp.ceSelect).toHaveValue('30');
    await expect(sp.fragSelect).toHaveValue('HCD');
  });

  test('提交 → 显示谱图 + 离子表', async ({ page }) => {
    const sp = new SingleModePage(page);
    await sp.predict();
    await expect(sp.spectrumImage).toBeVisible();
    await expect(sp.ionTable).toBeVisible();
    // 验证离子表有数据行
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(5);
  });

  test('离子表类型过滤', async ({ page }) => {
    const sp = new SingleModePage(page);
    await sp.predict();
    // 点击 "B" 过滤按钮
    await page.locator('button', { hasText: 'B' }).click();
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2); // b1 + b2
  });

  test('空序列时 Predict 按钮禁用', async ({ page }) => {
    const sp = new SingleModePage(page);
    await sp.sequenceInput.clear();
    await expect(sp.predictButton).toBeDisabled();
  });

  test('API 错误 → 显示 ERROR 信息', async ({ page }) => {
    await page.route('**/api/predict', route =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Sequence too long (max 30 AA)' }),
      })
    );
    const sp = new SingleModePage(page);
    await sp.predict();
    await expect(page.locator('text=ERROR')).toBeVisible();
    await expect(page.locator('text=Sequence too long')).toBeVisible();
  });

  test('Predict 中按钮显示 Loading 态', async ({ page }) => {
    // 设置延迟响应
    await page.route('**/api/predict', async route => {
      await new Promise(r => setTimeout(r, 1000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PREDICT_RESPONSE),
      });
    });
    const sp = new SingleModePage(page);
    await sp.predict();
    await expect(sp.predictButton).toContainText('PREDICTING');
    await expect(sp.predictButton).toBeDisabled();
  });

  test('修改参数后重新预测', async ({ page }) => {
    const sp = new SingleModePage(page);
    await sp.fillForm({ sequence: 'ACDEFGH', charge: '3', ce: '25', frag: 'CID' });
    await sp.predict();
    // 验证请求参数正确 (通过拦截)
    await expect(sp.spectrumImage).toBeVisible();
  });
});
```

#### 3. batch-mode.spec.ts — Batch 模式核心流程

```typescript
test.describe('Batch Mode — Mock API', () => {
  test.beforeEach(async ({ page }) => {
    // Mock submit
    await page.route('**/api/jobs/submit', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_SUBMIT_RESPONSE),
      })
    );
    await page.goto('/');
    await page.locator('.pixel-tab', { hasText: 'BATCH' }).click();
  });

  test('Drop zone 可见 + 文件选择', async ({ page }) => {
    const bp = new BatchModePage(page);
    await expect(bp.dropZone).toBeVisible();
    await expect(bp.submitButton).toBeDisabled();
  });

  test('上传 CSV → 显示文件信息 → Submit', async ({ page }) => {
    const bp = new BatchModePage(page);
    // Mock job status 轮询
    let pollCount = 0;
    await page.route('**/api/jobs/test-job-001', route => {
      pollCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          pollCount < 3 ? MOCK_JOB_STATUS_RUNNING : MOCK_JOB_STATUS_COMPLETED
        ),
      });
    });

    await bp.uploadFile('tests/fixtures/test_input.csv');
    await expect(page.locator('text=test_input.csv')).toBeVisible();
    await bp.submit();
    // JobStatus 出现
    await expect(page.locator('text=JOB:')).toBeVisible();
    // 等待完成
    await expect(bp.downloadButton).toBeVisible({ timeout: 10_000 });
  });

  test('拒绝非 CSV/TSV 文件', async ({ page }) => {
    // 使用 dialog 监听
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('CSV/TSV');
      await dialog.accept();
    });
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.xlsx',
      mimeType: 'application/vnd.ms-excel',
      buffer: Buffer.from('fake'),
    });
  });

  test('Job History — localStorage 持久化', async ({ page }) => {
    const bp = new BatchModePage(page);
    await page.route('**/api/jobs/test-job-001', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_STATUS_COMPLETED),
      })
    );
    await bp.uploadFile('tests/fixtures/test_input.csv');
    await bp.submit();
    await expect(page.locator('text=JOB HISTORY')).toBeVisible();
    // 刷新页面，history 仍在
    await page.reload();
    await page.locator('.pixel-tab', { hasText: 'BATCH' }).click();
    await expect(page.locator('text=test_input.csv')).toBeVisible();
  });

  test('Job History — 删除记录', async ({ page }) => {
    // 先提交一个 job 使 history 非空
    const bp = new BatchModePage(page);
    await page.route('**/api/jobs/test-job-001', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_JOB_STATUS_COMPLETED),
      })
    );
    await bp.uploadFile('tests/fixtures/test_input.csv');
    await bp.submit();
    await expect(page.locator('text=JOB HISTORY')).toBeVisible();
    // 删除
    await page.locator('button[title="Remove from history"]').click();
    await expect(page.locator('text=No batch jobs submitted yet')).toBeVisible();
  });

  test('Submit 失败 → 显示 ERROR', async ({ page }) => {
    await page.route('**/api/jobs/submit', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      })
    );
    const bp = new BatchModePage(page);
    await bp.uploadFile('tests/fixtures/test_input.csv');
    await bp.submit();
    await expect(page.locator('text=ERROR')).toBeVisible();
  });
});
```

#### 4. visual.spec.ts — 视觉回归

```typescript
test.describe('Visual Regression', () => {
  test('Single 模式 — 空状态截图', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('single-empty.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('Single 模式 — 暗色主题截图', async ({ page }) => {
    await page.goto('/');
    await page.locator('button[title="Toggle dark mode"]').click();
    await expect(page).toHaveScreenshot('single-empty-dark.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('Batch 模式 — 空状态截图', async ({ page }) => {
    await page.goto('/');
    await page.locator('.pixel-tab', { hasText: 'BATCH' }).click();
    await expect(page).toHaveScreenshot('batch-empty.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
```

### 测试 Fixture 文件

```
tests/fixtures/
├── test_input.csv      # 5 行有效 CSV (Sequence,Charge,collision_energy,Fragmentation)
└── test-base.ts        # 自定义 fixture (预置 mock)
```

`test_input.csv` 内容:
```csv
Sequence,Charge,collision_energy,Fragmentation
PEPTIDEK,2,30,HCD
ACDEFGH,3,25,HCD
KLMNPQR,2,27,CID
STUVWXY,4,35,HCD
AAAAAA,1,20,CID
```

### 实施步骤

1. `npm install -D @playwright/test` + `npx playwright install chromium firefox`
2. 创建 `playwright.config.ts`
3. 创建 `tests/mocks/api-handlers.ts` — Mock 数据
4. 创建 `tests/pages/SingleModePage.ts` + `BatchModePage.ts` — Page Objects
5. 创建 `tests/fixtures/test_input.csv` + `test-base.ts`
6. 编写 `tests/navigation.spec.ts` — 4 个用例
7. 编写 `tests/single-mode.spec.ts` — 7 个用例
8. 编写 `tests/batch-mode.spec.ts` — 6 个用例
9. 编写 `tests/visual.spec.ts` — 3 个视觉回归用例
10. 运行 `npx playwright test` 验证全部通过
11. 添加 `npm run test:e2e` script 到 `package.json`

### 运行命令

```bash
# 全部测试
npx playwright test

# 指定浏览器
npx playwright test --project=chromium

# UI 模式 (交互式调试)
npx playwright test --ui

# 仅 single 模式测试
npx playwright test tests/single-mode.spec.ts

# 更新视觉快照
npx playwright test --update-snapshots

# 查看报告 (远程服务器需绑定 0.0.0.0)
npx playwright show-report --host 0.0.0.0 --port 9323

# 查看 Trace (逐步 DOM 快照回放)
npx playwright show-trace test-results/<test-name>/trace.zip --host 0.0.0.0 --port 9324

# 视频文件位于 test-results/<test-name>/ 目录下 (.webm 格式)
```

### 远程无头服务器查看指南

| 产物 | 路径 | 查看方式 |
|------|------|----------|
| **HTML 报告** | `playwright-report/` | `show-report --host 0.0.0.0 --port 9323` → 浏览器访问 |
| **Trace 文件** | `test-results/*/trace.zip` | `show-trace <path> --host 0.0.0.0 --port 9324` → 逐步回放 |
| **视频录制** | `test-results/*/*.webm` | 直接下载/scp 到本地播放 |
| **失败截图** | `test-results/*/*.png` | HTML 报告中内嵌，或直接查看文件 |

> **注意**: 打开 5173 端口可以看到前端页面本身，但 **无法实时观测 Playwright 的操作过程**。
> Playwright 在无头模式下操作的是内部 Chromium 实例（不是你浏览器打开的页面），
> 两者互不干扰。要观察测试流程，需通过 Trace Viewer 回放或视频录制。

### 测试覆盖矩阵

| 组件 | 测试点 | 用例数 |
|------|--------|--------|
| **Header** | 标题、暗色切换、GitHub 链接 | 3 |
| **Tab 导航** | Single ↔ Batch 切换 | 1 |
| **PeptideForm** | 默认值、空序列禁用、参数修改 | 3 |
| **SpectrumImage** | 提交后显示、base64 渲染 | 1 |
| **IonTable** | 数据展示、类型过滤 | 2 |
| **CsvUpload** | 文件选择、拒绝非法格式 | 2 |
| **JobStatus** | 轮询进度、完成态、下载按钮 | 1 |
| **JobHistory** | 持久化、删除记录 | 2 |
| **错误处理** | API 422/500 → ERROR 展示 | 2 |
| **Loading 态** | Predict 中按钮禁用 + 文字变化 | 1 |
| **视觉回归** | 空状态、暗色主题截图 | 3 |
| **合计** | | **~20** |
