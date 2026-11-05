; fixture：makensis -PPO 宏展开产物快照（bug 0ebcc9f8 根因二查展开产物级静态锚）
; 来源：14:51 构建（1.14/009-rerun dist-win）的最终 NSIS 脚本预处理展开——
;   fix-3/001-nsis-path-scope/installer-ppo-expanded.nsi 第 1187-1345 行（un.checkAppRunning
;   Function 整段，逐字未改）。生成方式见同目录 run-ppo-probe.mjs（模板树 + build/installer.nsh
;   复制后仅归一注释为 ASCII，代码逐字保留；-PPO 纯预处理、零执行）。
; 判读锚：本段 = 卸载器上下文 CHECK_APP_RUNNING 插入点的真实展开——customCheckAppRunning
;   本体在场（$DshfPsPath 探测 / Quit 拒降级 / Win32_Process Path.StartsWith('$INSTDIR')
;   查杀 / un._GetProcessInfo）；全段无按名查杀分支（模板默认非 PowerShell 降级路径缺席）。
Function un.checkAppRunning
Var /GLOBAL CmdPath
Var /GLOBAL PowerShellPath
StrCpy $CmdPath "$SYSDIR\cmd.exe"
StrCpy $PowerShellPath "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
StrCpy $DshfPsPath "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`
Pop $0
!verbose push
!verbose 3
StrCmp `$0` `0` `` `_LogicLib_ElseLabel_15`
!verbose pop
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if ((Get-ExecutionPolicy -Scope Process) -eq 'Restricted') { exit 1 } else { exit 0 }"`
Pop $0
!verbose push
!verbose 3
_LogicLib_ElseLabel_15:
!verbose pop
!verbose push
!verbose 3
StrCmp `$0` `0` `_LogicLib_ElseLabel_17` ``
!verbose pop
MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDOK
Quit
!verbose push
!verbose 3
_LogicLib_ElseLabel_17:
!verbose pop
Push 0
Call un._GetProcessInfo
Pop $3
Pop $2
Pop $1
Pop $4
Pop $pid
!verbose push
!verbose 3
StrCmp `$3` `dsh-forge.exe` `_LogicLib_ElseLabel_19` ``
!verbose pop
!verbose push
!verbose 3
StrCmp "0" "1" `` `_LogicLib_ElseLabel_21`
!verbose pop
Sleep 300
!verbose push
!verbose 3
_LogicLib_ElseLabel_21:
!verbose pop
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
Pop $R0
!verbose push
!verbose 3
StrCmp `$R0` `0` `` `_LogicLib_ElseLabel_23`
!verbose pop
!verbose push
!verbose 3
StrCmp "0" "1" `` `_LogicLib_ElseLabel_25`
!verbose pop
Sleep 1000
Goto dshf_doStopProcess
!verbose push
!verbose 3
_LogicLib_ElseLabel_25:
!verbose pop
MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK dshf_doStopProcess
Quit
dshf_doStopProcess:
DetailPrint "$(appClosing)"
Push $0
StrCpy $0 ""
!verbose push
!verbose 3
StrCmp `0` `1` `` `_LogicLib_ElseLabel_27`
!verbose pop
StrCpy $0 "-Force"
!verbose push
!verbose 3
_LogicLib_ElseLabel_27:
!verbose pop
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }"`
Pop $0
Sleep 300
StrCpy $R1 0
dshf_loop:
IntOp $R1 $R1 + 1
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
Pop $R0
!verbose push
!verbose 3
StrCmp `$R0` `0` `` `_LogicLib_ElseLabel_29`
!verbose pop
Sleep 1000
Push $0
StrCpy $0 ""
!verbose push
!verbose 3
StrCmp `1` `1` `` `_LogicLib_ElseLabel_31`
!verbose pop
StrCpy $0 "-Force"
!verbose push
!verbose 3
_LogicLib_ElseLabel_31:
!verbose pop
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }"`
Pop $0
nsExec::Exec `"$DshfPsPath" -NoProfile -NonInteractive -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
Pop $R0
!verbose push
!verbose 3
StrCmp `$R0` `0` `` `_LogicLib_ElseLabel_33`
!verbose pop
DetailPrint `Waiting for "dsh-forge" to close.`
Sleep 2000
!verbose push
!verbose 3
Goto _LogicLib_EndIfLabel_34                                ; Go to the EndIf
_LogicLib_ElseLabel_33:
!verbose pop
Goto dshf_not_running
!verbose push
!verbose 3
_LogicLib_EndIfLabel_34:
!verbose pop
!verbose push
!verbose 3
Goto _LogicLib_EndIfLabel_35                                ; Go to the EndIf
_LogicLib_ElseLabel_29:
!verbose pop
Goto dshf_not_running
!verbose push
!verbose 3
_LogicLib_EndIfLabel_35:
!verbose pop
!verbose push
!verbose 3
IntCmp `$R1` `1` `_LogicLib_ElseLabel_37` `_LogicLib_ElseLabel_37` ``
!verbose pop
MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY dshf_loop
Quit
!verbose push
!verbose 3
Goto _LogicLib_EndIfLabel_38                                ; Go to the EndIf
_LogicLib_ElseLabel_37:
!verbose pop
Goto dshf_loop
!verbose push
!verbose 3
_LogicLib_EndIfLabel_38:
!verbose pop
dshf_not_running:
!verbose push
!verbose 3
_LogicLib_ElseLabel_23:
!verbose pop
!verbose push
!verbose 3
_LogicLib_ElseLabel_19:
!verbose pop
FunctionEnd
