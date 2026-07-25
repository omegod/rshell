# RShell

RShell 是一个小型桌面 SSH 客户端，聚焦远程终端、SFTP 文件管理和文本文件编辑。

## 功能

- 多 SSH 会话与终端标签页
- 密码或私钥认证，凭据使用 Electron `safeStorage` 加密落盘
- SFTP 目录浏览、创建、重命名和递归删除
- 文件上传、下载、进度显示和取消传输
- 5 MB 以内 UTF-8 文本文件编辑与常见语言高亮
- Linux 远端 CPU、内存和网络状态监控
- 浅色、深色主题和终端字号设置

## 支持范围

- macOS arm64
- Windows x64

Linux 桌面端和 Intel Mac 当前未纳入发布验收范围。系统监控针对 Linux 远端主机；其他远端系统仍可使用终端和 SFTP。

## 技术栈

- Electron 43
- React 19 + TypeScript
- electron-vite + Vite
- ssh2
- xterm.js
- Zustand
- Ant Design 5
- CodeMirror 6

## 开发

要求 Node.js 20 或更高版本。

```bash
git clone https://github.com/omegod/rshell.git
cd rshell
pnpm install --frozen-lockfile
pnpm dev
```

提交代码前运行：

```bash
pnpm typecheck
pnpm build
```

## 打包

```bash
# macOS arm64
pnpm package:mac

# macOS arm64，使用环境中配置的正式签名凭据
pnpm package:mac:signed

# Windows x64
pnpm package:win
```

`package:mac` 默认生成未签名的本地安装包。面向公众分发时，应在 CI 中配置正式代码签名凭据并运行 `package:mac:signed`。

## 验收

发布前检查项见 [docs/QA.md](docs/QA.md)。SSH 和 SFTP 行为需要使用测试服务器分别在 macOS 和 Windows 上执行手工验收。

## 项目结构

```text
src/main/       Electron 主进程、SSH/SFTP 和 IPC
src/preload/    安全的渲染进程 API
src/renderer/   React 界面
src/shared/     主进程与渲染进程共享类型
resources/      应用图标
```

## License

[MIT](LICENSE)
