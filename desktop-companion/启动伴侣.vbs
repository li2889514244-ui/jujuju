' 披星云桌面伴侣 - 静默启动 (无命令行窗口)
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)

' Find Python
PythonPath = ""
For Each ver In Array("313","312","311")
  testPath = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Python\Python" & ver & "\python.exe"
  If FSO.FileExists(testPath) Then PythonPath = testPath : Exit For
Next
If PythonPath = "" Then
  ' Try system Python
  PythonPath = "python"
End If

' Start companion silently
WshShell.Run """" & PythonPath & """ """ & ScriptDir & "\companion_app.py""", 0, False
