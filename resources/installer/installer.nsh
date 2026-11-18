; Presentation only: keep electron-builder's install, uninstall and update flow.
!define MUI_TEXTCOLOR "193C2D"
!define MUI_INSTFILESPAGE_COLORS "193C2D F5F8F1"

!macro customHeader
  BrandingText "RocMTSSolutions"
!macroend

!macro customWelcomePage
  ; Automatic updates retain their existing short/silent path.
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "Welcome to CERMS"
  !define MUI_WELCOMEPAGE_TEXT "Your club. Connected.$\r$\n$\r$\nSet up CERMS on this computer, then sign in to get started.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_TITLE "You're ready to go"
  !define MUI_FINISHPAGE_TEXT "CERMS is installed.$\r$\n$\r$\nOpen the app and sign in to your club."
!endif
