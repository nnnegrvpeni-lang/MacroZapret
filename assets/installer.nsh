!macro customHeader
  ; No global vars here to avoid compiler warnings if not referenced in some build configs
!macroend

!macro customPageAfterChangeDir
  Var CheckboxDesktopShortcut
  Var CreateDesktopShortcutVal

  Page custom customPage customPageLeave

  Function customPage
    !insertmacro MUI_HEADER_TEXT "Выбор дополнительных задач" "Выберите дополнительные задачи, которые должны быть выполнены при установке."

    nsDialogs::Create 1018
    Pop $0

    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Укажите дополнительные задачи, которые вы хотите выполнить при установке MacroZapret, и нажмите «Установить» для продолжения."
    Pop $0

    ${NSD_CreateCheckbox} 0 30u 100% 12u "Создать ярлык на Рабочем столе"
    Pop $CheckboxDesktopShortcut
    
    ; Default check it
    ${NSD_Check} $CheckboxDesktopShortcut

    nsDialogs::Show
  FunctionEnd

  Function customPageLeave
    ${NSD_GetState} $CheckboxDesktopShortcut $CreateDesktopShortcutVal
  FunctionEnd
!macroend

!macro customInstall
  ; We can read CreateDesktopShortcutVal here
  ${If} $CreateDesktopShortcutVal == 1
    CreateShortCut "$DESKTOP\MacroZapret.lnk" "$INSTDIR\MacroZapret.exe"
  ${EndIf}
!macroend
