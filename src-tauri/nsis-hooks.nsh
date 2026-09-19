!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::Exec '"$INSTDIR\macm-keybridge.exe" --cleanup'
    Pop $0
  ${EndIf}
!macroend
