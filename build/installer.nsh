# NSIS 卸载保留便携数据目录（2026-10-19 用户裁决）——customRemoveFiles 宏缝整段
# 替换官方默认 RMDir /r $INSTDIR（app-builder-lib uninstaller.nsh:161-188 合法缝）：
# 逐项删除 $INSTDIR 子项、跳过 data\（userData 便携根，main.ts 打包分支 setPath 消费），
# 升级覆盖安装不走本宏（仅卸载节消费），data\ 天然跨版本保留。
!macro customRemoveFiles
  SetOutPath $TEMP
  FindFirst $R0 $R1 "$INSTDIR\*.*"
  loop:
    StrCmp $R1 "" done
    StrCmp $R1 "." next
    StrCmp $R1 ".." next
    StrCmp $R1 "data" next
    RMDir /r "$INSTDIR\$R1"
    Delete "$INSTDIR\$R1"
  next:
    FindNext $R0 $R1
    Goto loop
  done:
    FindClose $R0
    # 运行中的卸载器 exe 由 NSIS 自删除机制收尾；data\ 留守时本行自然失败 = 目录保留
    RMDir "$INSTDIR"
!macroend
