Option Explicit
' GameArt Library - native window launcher (no console window)
' Double-click to open. Uses the Electron binary already installed in this folder.
Dim fso, sh, base, exe, appDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
exe = base & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Electron not found." & vbCrLf & vbCrLf & _
         "Please run this once in the project folder:" & vbCrLf & _
         "    dev.cmd npm install", 48, "GameArt Library"
  WScript.Quit 1
End If
sh.Run """" & exe & """ """ & base & """", 1, False
