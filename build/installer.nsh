; Ajouts à l'installeur Windows (electron-builder les inclut automatiquement).

; À la désinstallation, on retire aussi l'entrée de démarrage automatique créée par l'app,
; sinon Windows garderait une entrée orpheline. On ne le fait pas lors d'une mise à jour.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.workcompanion"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "app.workcompanion"
  ${endIf}
!macroend
