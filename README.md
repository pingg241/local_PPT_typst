# PPTypst

在 PowerPoint 里编写 Typst，实时预览后插入为 SVG，并支持选中已有对象后继续更新。

## 仓库来源

本仓库基于 [Splines/pptypst](https://github.com/Splines/pptypst) 深度修改而来。

当前版本已经不再是原仓库的简单镜像，而是在本地 Typst CLI 编译、本地 bridge、Tinymist 补全、中文界面和交互流程上做了较大调整。

## 这是什么

这个项目不是 COM/VSTO 原生插件，而是一个 **Office Web Add-in**。

当前运行链路是：

1. PowerPoint 任务窗格负责编辑、预览和插入
2. 本地 bridge 调用 `typst` CLI 编译 SVG
3. 可选地通过 `tinymist` 提供补全和诊断

## 运行依赖

日常使用至少需要：

- Windows 桌面版 PowerPoint
- Node.js 和 npm
- `typst`

可选依赖：

- `tinymist`
  没有它也能用，只是不会有智能补全和更完整的诊断

开发模式额外需要：

- 本地 `localhost` HTTPS 证书

建议先确认这些命令可用：

```powershell
node -v
npm -v
typst --version
tinymist --version
```

## 安装依赖

在项目根目录执行：

```powershell
npm install
```

## 日常使用

日常使用不需要 `npm run dev`，只需要 bridge。

先启动本地 bridge：

```powershell
npm run bridge
```

默认地址：

- bridge: `http://127.0.0.1:23627`

然后生成生产版 manifest：

```powershell
npm run generate-prod-manifest
```

这会在仓库根目录生成 `manifest.prod.xml`。

## 在 PowerPoint 里侧载

1. 新建一个目录，只放 `manifest.prod.xml`
2. 把这个目录共享成 Windows 共享目录，拿到 UNC 路径  
   例如：`\\你的电脑名\pptypst-catalog`
3. 打开 PowerPoint，进入  
   `文件 -> 选项 -> 信任中心 -> 信任中心设置 -> 受信任的加载项目录`
4. 把上面的 UNC 路径加进去
5. 重启 PowerPoint
6. 进入  
   `开始 -> 加载项 -> 更多加载项 -> 共享文件夹`
7. 加载 `PPTypst`

之后日常使用时：

- 不需要 `npm run dev`
- 需要在使用前保持 `npm run bridge` 正在运行

## 开发模式

开发模式会同时启动本地 bridge 和本地前端服务：

```powershell
npm run dev
```

也可以分开启动：

```powershell
npm run bridge
npm run dev:web
```

默认地址：

- bridge: `http://127.0.0.1:23627`
- web: `https://localhost:3155`

开发模式依赖本地证书文件：

```text
web/certs/localhost.crt
web/certs/localhost.key
```

如果你没有证书，可以用 `mkcert` 生成：

```powershell
mkcert -install
mkcert -cert-file web/certs/localhost.crt -key-file web/certs/localhost.key localhost
```

开发版侧载用的是仓库里的 `manifest.xml`，它指向本地 `https://localhost:3155/pptypst/...`。

## 常用命令

```powershell
npm run bridge
npm run dev
npm run dev:web
npm run build
npm run lint
npm run typecheck
npm run validate
npm run generate-prod-manifest
npm run validate-prod
```

## 目录说明

- `web/`
  任务窗格前端
- `local-bridge/`
  本地 bridge，负责 Typst 编译和 Tinymist LSP 转发
- `scripts/`
  开发和 manifest 生成脚本
- `manifest.xml`
  开发版 manifest

## 常见问题

### 插件能打开，但预览或插入失败

先检查：

```powershell
typst --version
```

再确认：

- `npm run bridge` 是否正在运行
- `23627` 端口是否被占用

### 没有智能补全

先检查：

```powershell
tinymist --version
```

如果没有安装 `tinymist`，插件会退回基础编辑模式，这是预期行为。

### `npm run dev` 启动失败

优先检查：

- `web/certs/localhost.crt`
- `web/certs/localhost.key`

### 想清理侧载记录

可以移除 PowerPoint 里的受信任目录和共享文件夹记录。

如果还需要清缓存，可在关闭 PowerPoint 后清理：

```text
%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\
```
