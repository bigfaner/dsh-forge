// Built-in minimal shell fallback document (task disc-1).
//
// Served over dsh-app://app/ whenever the upstream web dist is missing or the
// host reached the terminal failed state — the blank-white-screen defect: an
// empty document never resolves the upstream boot gate, so the shell-ui
// overlay (UF3/UF4) never mounted even though main-side recovery had already
// reached `failed`. This document depends on NO upstream assets: it carries
// the boot-gate contract (already resolved — there is no upstream entry to do
// it), the #dsh-forge-shell-root mount point, and the same shell-ui bundle,
// so the UF4 failed dialog renders instead of white.
//
// Styling follows DESIGN.md semantic tokens with literal fallbacks (the token
// definitions normally come from the upstream stylesheet, which is absent
// here by construction).

/** Render the built-in shell fallback document. */
export function shellFallbackDocument(shellUiScriptUrl: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-forge</title>
<style>
html,body{margin:0;padding:0;height:100%;}
body{background:var(--dsw-alias-bg-base,#ffffff);color:var(--dsw-alias-label-secondary,rgb(97,102,107));
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
display:flex;align-items:center;justify-content:center;}
#dsh-forge-shell-fallback-status{font-size:14px;line-height:22px;text-align:center;
max-width:min(480px,calc(100vw - 48px));}
</style>
</head>
<body>
<div id="dsh-forge-shell-root"></div>
<div id="dsh-forge-shell-fallback-status">正在连接本地运行时…</div>
<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers(); globalThis.__DSH_BOOT_READY__.resolve()</script>
<script src="${shellUiScriptUrl}"></script>
</body>
</html>
`
}

/** Serve the built-in shell fallback document for a local application request. */
export function serveShellFallback(request: Request, shellUiScriptUrl: string): Response {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  return new Response(request.method === 'HEAD' ? null : shellFallbackDocument(shellUiScriptUrl), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
