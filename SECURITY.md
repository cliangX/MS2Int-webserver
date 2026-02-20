# Security Notes — MS2Int Webserver

部署前务必阅读此文档。当前架构为研究/演示用途，公网部署需完成以下加固。

---

## 🔴 高风险（部署前必须修复）

### 1. Vite Dev Server 不可用于生产

**问题**：`vite dev` 会暴露 sourcemaps（完整前端源码可被任意用户下载），无生产级缓存，性能差。

**修复**：

```bash
cd frontend
npm run build          # 生成 dist/ 静态文件
# 用 Nginx / Caddy 托管 dist/，而非 vite dev
```

示例 Nginx 配置片段：
```nginx
server {
    listen 80;
    server_name ms2int.com;
    root /path/to/frontend/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ { proxy_pass http://127.0.0.1:8000; }
}
```

---

### 2. API 无速率限制（Rate Limiting）

**问题**：`/api/predict` 每次请求触发 GPU 推理，无限制请求可将推理队列打满，造成服务不可用。

**修复**：在 FastAPI 安装并配置 `slowapi`：

```bash
pip install slowapi
```

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/api/predict")
@limiter.limit("10/minute")   # 每 IP 每分钟最多 10 次预测
async def predict(request: Request, ...):
    ...
```

---

### 3. 文件上传无大小限制

**问题**：CSV / FASTA 上传无最大文件大小校验，恶意用户可上传超大文件撑爆内存/磁盘。

**修复（Nginx 层）**：
```nginx
client_max_body_size 50M;
```

**修复（FastAPI 层）**：在 `submit` endpoint 中读取后检查行数上限（当前 FASTA 端点已有 500 条限制，CSV 端点待加）。

---

## 🟡 中风险（建议尽快处理）

### 4. CORS 配置过宽

**问题**：如果 `app.py` 配置了 `allow_origins=["*"]`，任何域均可跨域请求 API。

**修复**：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ms2int.com"],  # 只允许生产域名
    ...
)
```

---

### 5. Job 存储无磁盘配额

**问题**：`backend/jobs/` 目录随 Batch 任务无限增长，磁盘满后服务崩溃。

**修复建议**：
- 在 `job_manager.py` 的任务清理逻辑中加总大小上限
- 部署时为 `jobs/` 目录单独挂载限额磁盘分区
- 设置 cron 定期清理 24h 前的任务

---

### 6. FastAPI 错误信息泄露

**问题**：FastAPI 默认将异常 traceback 返回给客户端（暴露文件路径、模型路径等）。

**修复**：生产启动时关闭 debug，并添加全局异常处理器返回通用错误信息：

```python
@app.exception_handler(Exception)
async def generic_handler(request, exc):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

---

## 🟢 Cloudflare 已覆盖（无需额外操作）

- L3/L4 DDoS 防护
- Bot 基础过滤
- SSL/TLS 终结（HTTPS）
- 基础 WAF（Pro 及以上套餐）

---

## 优先级排序

| 优先级 | 项目 | 是否阻塞上线 |
|--------|------|------------|
| P0 | 改用 `vite build` 静态部署 | ✅ 是 |
| P0 | API 速率限制（slowapi） | ✅ 是 |
| P1 | 文件上传大小限制 | 建议 |
| P1 | CORS 收窄到 ms2int.com | 建议 |
| P2 | Job 目录配额 + 定期清理 | 建议 |
| P2 | 全局异常处理器 | 建议 |
