# MS2Int Webserver — 待办事项

参考 MS2PIP (https://iomics.ugent.be/ms2pip/) 对比分析后整理。

---

## 优先级：高

- [ ] **[后端] 输出格式多样化**：新增 `/api/jobs/{id}/download?format=mgf|msp|csv` 端点，从 H5 结果生成 MGF / MSP / CSV 三种格式
- [ ] **[前端] Batch/FASTA 模式输出格式选择**：提交任务前让用户选择下载格式（CSV / MGF / MSP）
- [ ] **[前端] Batch 模式 CSV 模板下载**：添加"下载示例 CSV"按钮，一键获取标准输入格式模板
- [ ] **[前端] Single 模式结果下载**：预测完成后显示"下载 MGF / CSV"按钮，让单条预测结果可直接保存
- [ ] **[后端] Single 模式 MGF 端点**：`/api/predict` 响应额外返回 MGF 字符串，或新增 `/api/predict/download?format=mgf` 端点

---

## 优先级：中

- [ ] **[前端] 修饰快速插入面板**：Single 模式序列输入框下方显示常见修饰按钮（Oxidation、Phospho、Carbamidomethyl、Acetyl 等），点击自动插入到序列末光标位置
- [ ] **[前端] Batch/FASTA 任务结果预览**：任务完成后展示前 5 条肽段的 top ion 摘要，无需下载即可快速验证结果
- [ ] **[前端] IonTable 复制按钮**：右上角加"COPY TSV"按钮，一键将离子表复制到剪贴板
- [ ] **[前端] 离子颜色图例**：SpectrumImage 下方或 IonTable 上方显示 b=蓝 / y=红 的颜色图例说明

---

## 优先级：低

- [ ] **[前端] 模型信息展示**：Header 或 About 区域显示当前加载的模型名称 / 版本 / 设备（CPU/GPU）
- [ ] **[前端] 键盘快捷键**：Single 模式下按 Enter 直接提交预测
- [ ] **[前端] How-to 折叠说明卡**：每个 Tab 顶部可折叠的使用说明（输入格式示例、修饰语法说明）

---

## 已完成

- [x] 排查前端界面格式乱的问题
- [x] README.md 添加 GitHub 地址和 web server 地址
- [x] 对齐 PLAN.md：pixel-card-header、Footer、空状态、修复 border
- [x] 新增 FASTA 面板：后端 endpoint + 前端 FastaMode 组件 + App.tsx tab
- [x] 重写 IonTable.tsx：全面用 inline styles，对齐 PLAN.md 列顺序和样式规范
- [x] PeptideForm 布局：CSS Grid 四列，标签行 + 控件行，★ 修饰提示
- [x] CHARGE 可选项扩展至 1-7
