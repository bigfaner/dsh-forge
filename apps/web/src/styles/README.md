# styles/

定位：**基础** —— 令牌引入与全局样式（仅 `--dsw-*`；1.5 填充）。
边界：零裸值（色/字号/间距/圆角/阴影）——`scripts/lint-tokens.mjs` 入 G0 机械执行。

- `global.css` —— 全局基底：仅消费官方令牌（`--dsw-font-family` / `--dsw-alias-bg-base` /
  `--dsw-alias-label-primary`）；令牌由官方 ui-theme client bundle 激活注入（boot 注入行装载），
  注入前取关键字回退，不取裸值。
