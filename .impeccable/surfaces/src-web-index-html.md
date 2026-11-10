---
version: 1
slug: "src-web-index-html"
primary_target: "src/web/index.html"
related_targets: ["client.js"]
---

# 额度看板

Mode: operate

Audience: Joe scans daily; a developer who just cloned the repo must tell a missing credential from a broken page.
Task: see which subscription is still usable, which is low or exhausted, and when it resets.
Constraints: Chinese copy, local only, last good numbers stay, missing windows stay empty, local page and Harness strip are one product.

## Direction contract

THESIS: 每家订阅是一条地铁线，列车离终点越近，额度越少。页面拒绝等大卡片网格。
OWN-WORLD: 地是 #F7F7F5，字是 #141414。每家一条饱和线路色。站点是刻度，签名是一颗实心圆停在已用的位置，右端终点表示用尽。数字用自托管的无衬线，中文名用系统黑体。没有卡片壳。
STORY: 打开就看见哪一趟车快到终点，然后按刷新。克隆来的人看见一条没有车的线，和一句缺凭证或页面变了的话。
FIRST VIEWPORT: 顶栏是名称、本地标记、重新读取、刷新额度。下面八条水平线。左是线路色和名字，中是轨道和每扇窗口的站名，右是默认窗口的大号剩余。列车停在默认窗口的已用位置。用尽的车停在终点，颜色 #C23B22。偏低是 #8A5A00。刷新是顶栏最右的按钮。
FORM: 地铁线路图。按共鸣它排在第一，种子 75324a2d。用户选了这一张，没有选抽到的价目牌。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
