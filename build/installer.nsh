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

# bug 167b5121 根治：customCheckAppRunning 宏缝（模板 allowOnlyOneInstallerInstance.nsh
# CHECK_APP_RUNNING 的 !ifmacrodef 分支）——进程查杀改路径域。
#
# 缺陷机制：默认分支非 PowerShell 路径按 IMAGENAME 全机匹配 + taskkill /IM 强杀同名进程
# （dsh-forge.exe），静默安装 /SD IDOK 自动确认即误杀任意 dsh-forge 宿主。本宏用模板
# PowerShell 分支同款实现（Win32_Process Path.StartsWith('$INSTDIR')）承担全部查/杀，
# 按名匹配分支因宏被接管而缺席；PowerShell 不可用时拒绝降级到按名查杀（提示后退出）。
#
# 注意：本宏被接管后模板不再自动 !include getProcessInfo.nsh（其 !ifmacrondef 守卫），
# 须在此自备；`Var pid` 同理由本文件声明（模板仅在自己接管时声明）。
!include "getProcessInfo.nsh"
Var pid
Var /GLOBAL DshfPsPath

# PowerShell 可用性探测（模板 IS_POWERSHELL_AVAILABLE 同款：CimInstance 在场 + 策略非 Restricted）
!macro DSHF_PS_CHECK
  nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`
  Pop $0
  ${if} $0 == 0
    nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if ((Get-ExecutionPolicy -Scope Process) -eq 'Restricted') { exit 1 } else { exit 0 }"`
    Pop $0
  ${endif}
!macroend

# 路径域查：$INSTDIR 前缀命中即 exit 0（模板 FIND_PROCESS PowerShell 分支同款）
!macro DSHF_FIND_BY_PATH _RETURN
  nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
  Pop ${_RETURN}
!macroend

# 路径域杀：仅对 $INSTDIR 前缀进程 Stop-Process（模板 KILL_PROCESS PowerShell 分支同款）
!macro DSHF_KILL_BY_PATH _FORCE
  Push $0
  StrCpy $0 ""
  ${if} ${_FORCE} == 1
    StrCpy $0 "-Force"
  ${endif}
  nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }"`
  Pop $0
!macroend

!macro customCheckAppRunning
  StrCpy $DshfPsPath "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  # PowerShell 不可用：宁可不装，不降级按名查杀（bug 167b5121 硬约束）
  !insertmacro DSHF_PS_CHECK
  ${if} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDOK
    Quit
  ${endif}

  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      # allow app to exit without explicit kill
      Sleep 300
    ${endif}

    !insertmacro DSHF_FIND_BY_PATH $R0
    ${if} $R0 == 0
      ${if} ${isUpdated}
        # allow app to exit without explicit kill
        Sleep 1000
        Goto dshf_doStopProcess
      ${endif}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK dshf_doStopProcess
      Quit

      dshf_doStopProcess:
      DetailPrint "$(appClosing)"

      !insertmacro DSHF_KILL_BY_PATH 0
      # to ensure that files are not "in-use"
      Sleep 300

      # Retry counter
      StrCpy $R1 0

      dshf_loop:
        IntOp $R1 $R1 + 1

        !insertmacro DSHF_FIND_BY_PATH $R0
        ${if} $R0 == 0
          # wait to give a chance to exit gracefully
          Sleep 1000
          !insertmacro DSHF_KILL_BY_PATH 1 # 1 = force kill
          !insertmacro DSHF_FIND_BY_PATH $R0
          ${if} $R0 == 0
            DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
            Sleep 2000
          ${else}
            Goto dshf_not_running
          ${endif}
        ${else}
          Goto dshf_not_running
        ${endif}

        # App likely running with elevated permissions.
        # Ask user to close it manually
        ${if} $R1 > 1
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY dshf_loop
          Quit
        ${else}
          Goto dshf_loop
        ${endif}
      dshf_not_running:
    ${endif}
  ${endif}
!macroend
