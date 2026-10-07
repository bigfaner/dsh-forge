# dsh-forge — forge standard targets（/forge:init-justfile 生成，2026-10-06）
#
# 面（surfaces）: web（标量）——Electron 宿主壳，非 HTTP 服务面：
#   dev  = vite build --watch + tsc -b --watch + electron 宿主（scripts/dev.mjs；
#          bare vite serve 缺 __DSH_BOOT__ 注入不可用，故无健康 URL）
#   test = Playwright _electron e2e（e2e/playwright.config.ts，globalSetup 前置构建，自含）
# 两层测试模型：unit-test = 语言级 vitest（任务提交门）；test = 面级 Playwright e2e。

# --- forge standard recipes ---

default:
    just --list

# user-customized
[group("node")]
install:
    pnpm install

# user-customized
[group("node")]
compile:
    pnpm build

# user-customized
[group("node-test")]
fmt:
    #!/usr/bin/env bash
    echo "no-op: 项目未配置格式化器（oxlint 仅检查，无 prettier/biome）——如需请自定义本配方"

# user-customized
[group("node-test")]
lint:
    pnpm lint

# user-customized
[group("node-test")]
unit-test:
    pnpm test

# user-customized
[group("node")]
ci:
    just lint && just compile && just unit-test

# user-customized
[group("node")]
clean:
    #!/usr/bin/env bash
    rm -rf apps/web/dist apps/host/dist packages/*/dist e2e/test-results

# user-customized
[group("web")]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    _pid_file=".forge/web.pid"
    mkdir -p .forge
    # Layer 1: tracked process alive?
    if [ -f "$_pid_file" ] && kill -0 "$(tr -d '\r' < "$_pid_file")" 2>/dev/null; then
        echo "web: already running (PID $(tr -d '\r' < "$_pid_file"))"
        exit 0
    fi
    [ -f "$_pid_file" ] && rm -f "$_pid_file"
    # Layer 2: start（pnpm dev = vite build watch + tsc watch + electron 宿主）
    pnpm dev &
    printf '%s\n' "$!" > "$_pid_file"
    _cleanup() {
        [ -f "$_pid_file" ] || return 0
        _pid="$(tr -d '\r' < "$_pid_file")"
        case "$(uname -s)" in
            # Windows 整树强杀防 watcher 孤儿（scripts/dev.mjs 注：2026-10-06 孤儿
            # watcher 内存事故根因——Windows 无父子生命周期绑定）
            MSYS_NT*|MINGW*|CYGWIN*)
                # pidfile 记 MSYS pid——taskkill 需 Windows pid，经 /proc 翻译
                _wp="$(cat /proc/"$_pid"/winpid 2>/dev/null || echo "$_pid")"
                taskkill //T //F //PID "$_wp" 2>/dev/null || true ;;
            *) kill "$_pid" 2>/dev/null || true ;;
        esac
        rm -f "$_pid_file"
    }
    trap _cleanup EXIT INT TERM
    wait

# user-customized
[group("web")]
probe:
    #!/usr/bin/env bash
    set -euo pipefail
    # web 面无 HTTP dev 服务（壳需 __DSH_BOOT__ 注入，宿主载 dist）——
    # 就绪 = dev 进程存活 + build watch 产物就位
    _pid_file=".forge/web.pid"
    _dist="apps/web/dist/index.html"
    _max_retries=3
    _retry_interval=5
    _is_healthy() {
        [ -f "$_pid_file" ] && kill -0 "$(tr -d '\r' < "$_pid_file")" 2>/dev/null && [ -f "$_dist" ]
    }
    for _i in $(seq 1 $_max_retries); do
        if _is_healthy; then
            echo "OK: web (PID $(tr -d '\r' < "$_pid_file"); $_dist)"
            exit 0
        fi
        [ "$_i" -lt "$_max_retries" ] && sleep $_retry_interval
    done
    echo "FAIL: web not healthy after ${_max_retries} attempts (dev PID + $_dist)" >&2
    exit 1

# user-customized
[group("web")]
test journey="":
    #!/usr/bin/env bash
    set -euo pipefail
    # 面级 e2e：Playwright _electron。journey 过滤 = Playwright 位置参数
    # （spec 文件/目录名，如 web-shell、host-boot、p1mvp）
    if [ -n "{{journey}}" ]; then
        pnpm test:e2e {{journey}}
    else
        pnpm test:e2e
    fi

# user-customized
[unix]
teardown:
    #!/usr/bin/env bash
    set -euo pipefail
    _pid_file=".forge/web.pid"
    if [ -f "$_pid_file" ]; then
        kill "$(tr -d '\r' < "$_pid_file")" 2>/dev/null || true
        rm -f "$_pid_file"
    fi

# user-customized
[windows]
teardown:
    #!/usr/bin/env bash
    set -euo pipefail
    _pid_file=".forge/web.pid"
    if [ -f "$_pid_file" ]; then
        _pid="$(tr -d '\r' < "$_pid_file")"
        # //T 整树强杀防 watcher 孤儿（scripts/dev.mjs 注：Windows 无父子生命周期绑定）；
        # pidfile 记 MSYS pid——taskkill 需 Windows pid，经 /proc 翻译
        _wp="$(cat /proc/"$_pid"/winpid 2>/dev/null || echo "$_pid")"
        taskkill //T //F //PID "$_wp" 2>/dev/null || true
        rm -f "$_pid_file"
    fi

# user-customized
[group("web")]
web:
    #!/usr/bin/env bash
    set -euo pipefail
    # 全生命周期：dev（后台拉起，幂等）→ probe → test → teardown（EXIT 兜底；
    # test 失败也必走 teardown，rc 透传）
    just dev &
    trap 'just teardown' EXIT
    just probe && just test

# --- end forge standard recipes ---
