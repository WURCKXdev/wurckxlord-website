; Inno Setup script for FLUX (built by GitHub Actions).
; iscc /DDist=<folder with FLUX.exe, FLUX.vst3, INSTALL.txt> /DAppVersion=x.y.z FLUX.iss

#ifndef Dist
  #define Dist "..\..\dist"
#endif
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif

[Setup]
AppId={{8B5E2F4C-2C7A-4F7B-9E61-6A1F0C3D9A11}
AppName=FLUX
AppVersion={#AppVersion}
AppVerName=FLUX {#AppVersion}
AppPublisher=WurckxLord
DefaultDirName={autopf}\FLUX
DefaultGroupName=FLUX
DisableProgramGroupPage=yes
OutputBaseFilename=FLUX-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
UninstallDisplayIcon={app}\FLUX.exe
UninstallDisplayName=FLUX

[Types]
Name: "full"; Description: "VST3 plugin + standalone app"
Name: "custom"; Description: "Custom"; Flags: iscustom

[Components]
Name: "vst3"; Description: "VST3 plugin (installs to Common Files\VST3 for your DAW)"; Types: full custom
Name: "standalone"; Description: "Standalone app (runs without a DAW)"; Types: full custom

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Components: standalone

[Files]
Source: "{#Dist}\FLUX.vst3\*"; DestDir: "{commoncf64}\VST3\FLUX.vst3"; Flags: recursesubdirs createallsubdirs ignoreversion; Components: vst3
Source: "{#Dist}\FLUX.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: standalone
Source: "{#Dist}\INSTALL.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
Name: "{group}\FLUX"; Filename: "{app}\FLUX.exe"; Components: standalone
Name: "{group}\How to use FLUX"; Filename: "{app}\INSTALL.txt"
Name: "{group}\Uninstall FLUX"; Filename: "{uninstallexe}"
Name: "{autodesktop}\FLUX"; Filename: "{app}\FLUX.exe"; Tasks: desktopicon; Components: standalone

[Run]
Filename: "{app}\FLUX.exe"; Description: "Launch FLUX now"; Flags: nowait postinstall skipifsilent; Components: standalone

[UninstallDelete]
Type: filesandordirs; Name: "{commoncf64}\VST3\FLUX.vst3"
