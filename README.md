# Live Signature Wall Pro 3.2

一套可自托管的现场电子签名墙：签名端、现实 LED 大屏端、设计与控制台、实时同步和数据持久化均包含在同一个项目中。

## 页面

- 签名端：`http://localhost:3000/sign`
- LED 大屏端：`http://localhost:3000/display`
- 设计与控制台：`http://localhost:3000/studio`
- 运行状态：`http://localhost:3000/api/stats`

兼容旧地址：`/admin`、`/wall`、`/settings`。

## 核心功能

### 签名端

- 只需要手写签名，无姓名、照片、公司等额外步骤。
- 圆润笔、钢笔、马克笔、霓虹笔。
- 实线、虚线、点线、点划线。
- 8 种快捷颜色和任意自定义颜色。
- 1–24 级粗细、20%–100% 透明度。
- 橡皮擦、撤销、重做、全部重写。
- 触摸屏、手写笔、鼠标和压力感应支持。
- 签名自动裁剪为透明 PNG 后实时上墙。

### LED 大屏端

- 使用统一尺寸的稳定随机槽位，不再把少量签名放大铺满整个屏幕。
- 每份签名分配独立矩形安全区，签名之间不遮挡、不交叉、不旋转。
- 同一密度档位内，已上墙签名保持稳定位置；新签名随机进入未占用槽位。
- 签名数量增加时，所有签名按统一档位缩小，不会出现单个签名忽大忽小。
- 最小密度档位满载后自动分页，绝不通过叠放强行塞入。
- 自动避开标题、状态栏、底部信息和签名发光预留区域。
- 签名图片保持原始宽高比，透明边缘不会被容器裁切。
- 支持 F 键进入或退出全屏。

### 设计与控制台

- 修改主标题、副标题、字体、字号、颜色和对齐方式。
- 控制标题、连接状态、签名计数和底部说明是否显示。
- 星空、极光、午夜、日出、珍珠白五套背景预设。
- 自定义三色渐变、角度、遮罩、模糊和动态星点。
- 上传 PNG/JPEG/WebP 背景图片，支持铺满、完整显示和拉伸。
- 调整签名间距、墙体内边距、每页数量、翻页时间、透明度和发光。
- 设置签名端默认笔刷、线型、颜色、粗细和透明度。
- 实时大屏预览、配置导入导出、恢复默认设计。
- 查看并删除最近签名、清空全部签名。

## Windows 启动

要求 Node.js 20 或更高版本，推荐 Node.js 22 LTS。

解压后双击：

```text
start-windows.cmd
```

也可以在终端运行：

```powershell
cd C:\你的路径\live-event-wall
npm install --registry=https://registry.npmjs.org/
npm start
```

依赖损坏时双击：

```text
repair-windows.cmd
```

## 局域网和现实 LED 大屏

1. 运行项目的电脑、签名触摸屏和手机连接同一局域网。
2. 在 Windows 运行 `ipconfig`，找到电脑 IPv4 地址，例如 `192.168.1.20`。
3. 签名设备打开 `http://192.168.1.20:3000/sign`。
4. 连接 LED 视频处理器的电脑打开 `http://192.168.1.20:3000/display`。
5. 通过 HDMI 或 DisplayPort 输出到现实 LED 大屏，按 F 进入全屏。
6. 设计人员打开 `http://192.168.1.20:3000/studio` 修改背景和标题。

Windows 防火墙需要允许 TCP 3000 端口进入。

## 可选管理口令

局域网内默认不需要口令。需要保护设计、删除和清空操作时，启动前设置：

```cmd
set WALL_ADMIN_TOKEN=你的管理口令
npm start
```

然后在 `/studio` 的“管理口令”输入框中填写同一口令。

## 数据目录

```text
data/entries.json          签名记录
data/settings.json         活动设计配置
uploads/signatures/        透明签名 PNG
uploads/backgrounds/       自定义背景图片
```

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `MAX_SIGNATURES`：最多保留签名数量，默认 `1000`
- `WALL_ADMIN_TOKEN`：可选管理口令

## 代码检查

```powershell
npm run check
```


## 3.2 布局修复

- 修复少量签名被自动放大到半屏或全屏的问题。
- 修复底部签名被墙体容器裁切的问题。
- 布局改为固定矩形槽位 + 稳定哈希随机分配；随机只影响位置，不影响碰撞安全。
- 所有签名使用同一尺寸档位，并按数量统一缩放。
- 屏幕尺寸、标题高度或配置变化后重新计算安全区和分页容量。
- 1920×1080、1790×830、1280×500、3840×1600 等尺寸的矩形碰撞测试均为 0 重叠、0 越界。

## v3.3 LED wall layout fix

The display page no longer uses the project-specific absolute-position collision code. It vendors Packery 3.0.0 and lets Packery perform all rectangle placement.

- Every signature uses the fixed width and height configured in Studio.
- Empty Packery cells are shuffled with the signatures so sparse pages look random.
- Each cell clips its own content, including pen strokes and glow, so one signature cannot enter another cell.
- The Packery grid is centered inside the title/footer safe area and clipped by the LED wall viewport.
- When capacity is reached, the existing pagination is used instead of shrinking or stacking signatures.
