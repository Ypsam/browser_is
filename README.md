# browser_is

一个最小可运行的“浏览器壳 + 本地用户脚本（类似 Tampermonkey）”桌面端 MVP（Electron/Chromium）。

## 已实现

- 地址栏浏览
- 本地脚本保存（device local）
- URL 匹配（简化版 `*` 通配）
- 脚本注入前拦截弹窗：阻止 / 允许一次 / 总是允许此站点

## 运行（Windows）

```bash
npm install
npm run electron:dev
```

## 用法

- 点击右上角「脚本」新增脚本
- 打开任意网站，若匹配到脚本会先弹窗确认
- 选择「允许一次」或「总是允许此站点」后，脚本会被注入执行

## 说明（MVP 限制）

- 目前是最小实现：没有完整的 Tampermonkey 元数据解析（`@match`/`@include`/`@exclude`）、也没有沙箱/GM_* API
- `runAt` 仅支持 `dom-ready` 与 `did-finish-load`

