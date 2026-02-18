# 父亲医学研究网站

这是一个面向老年用户的中文医学资讯网站，聚焦两个主题：

- 高血压肾病
- 门静脉高压症
- 当今世界时事新闻（英文媒体来源，中文展示）
- 当今世界金融新闻（英文媒体来源，中文展示）

## 特性

- 中文界面，默认大字号，阅读更清晰
- 仅展示两大主题的最新研究条目
- 每个医学主题每天最多 5 篇文献
- 医学文献按 PMID 去重，避免日更重复
- 每日自动更新（通过 GitHub Actions）

## 本地查看

直接用浏览器打开 `index.html` 即可。

如果需要本地服务（避免浏览器跨域限制），可在项目目录运行：

```bash
python3 -m http.server 8080
```

然后访问：`http://localhost:8080`

## 手动更新最新研究数据

```bash
node scripts/update-research.mjs
```

更新后会写入：`data/latest.json`
并维护去重历史：`data/research-history.json`

## 自动每日更新

项目内置工作流：`.github/workflows/daily-update.yml`

- 每天 UTC 01:15 自动运行
- 可在 GitHub Actions 页面手动触发
- 只有数据变更时才会自动提交

## 数据来源

- PubMed / NCBI E-utilities API
