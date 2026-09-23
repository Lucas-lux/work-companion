'use strict';

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper PowerShell persistant : on lui envoie des commandes ligne par ligne sur stdin,
// il répond "<id> <json>" sur stdout. Évite de relancer PowerShell toutes les secondes.
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WcNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static string Title(IntPtr h) { int n = GetWindowTextLength(h); var sb = new StringBuilder(n + 1); GetWindowText(h, sb, sb.Capacity); return sb.ToString(); }
}
'@
[void][WcNative]::SetProcessDPIAware()
# UI Automation : lit la barre d'adresse du navigateur (premier champ texte de la fenetre = omnibox)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$editCond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
$descCache = @{}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Trim().Split(' ')
  if ($parts.Length -lt 2) { continue }
  $id = $parts[0]
  $res = @{ ok = $true }
  try {
    switch ($parts[1]) {
      'active' {
        $hw = [WcNative]::GetForegroundWindow()
        if ($hw -eq [IntPtr]::Zero) { $res = @{ hwnd = 0 }; break }
        [uint32]$procId = 0
        [void][WcNative]::GetWindowThreadProcessId($hw, [ref]$procId)
        $rect = New-Object WcNative+RECT
        [void][WcNative]::GetWindowRect($hw, [ref]$rect)
        $name = ''; $desc = ''
        $p = Get-Process -Id $procId
        if ($p) {
          $name = $p.ProcessName
          if ($descCache.ContainsKey($name)) { $desc = $descCache[$name] }
          else { try { $desc = $p.MainModule.FileVersionInfo.FileDescription } catch {}; $descCache[$name] = $desc }
        }
        $res = @{ hwnd = $hw.ToInt64(); pid = [int]$procId; proc = $name; desc = $desc; title = [WcNative]::Title($hw);
                  x = $rect.Left; y = $rect.Top; w = $rect.Right - $rect.Left; h = $rect.Bottom - $rect.Top }
      }
      'url' {
        $hw = [IntPtr][long]$parts[2]
        $url = ''
        $root = $AE::FromHandle($hw)
        $edit = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCond)
        if ($edit -ne $null) { $url = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value }
        $res = @{ url = "$url" }
      }
      'close' {
        $hw = [IntPtr][long]$parts[2]
        $res = @{ ok = [WcNative]::PostMessage($hw, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }
      }
      'closetab' {
        $hw = [IntPtr][long]$parts[2]
        if ([WcNative]::GetForegroundWindow() -ne $hw) { $res = @{ ok = $false }; break }
        [WcNative]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
        [WcNative]::keybd_event(0x57, 0, 0, [UIntPtr]::Zero)
        [WcNative]::keybd_event(0x57, 0, 2, [UIntPtr]::Zero)
        [WcNative]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
      }
    }
  } catch { $res = @{ ok = $false; error = "$_" } }
  [Console]::Out.WriteLine($id + ' ' + ($res | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;

const NOTIF_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings';

class WinPlatform {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.seq = 0;
    this.waiters = new Map();
    this.buf = '';
    this.proc = null;
    this.stopped = false;
  }

  async start() {
    this.file = path.join(this.dataDir, 'wc-helper.ps1');
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file, PS_SCRIPT, 'utf8');
    this._spawn();
  }

  _spawn() {
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.file], { windowsHide: true });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      this.buf += chunk;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        this._onLine(line);
      }
    });
    p.stderr.on('data', (d) => console.warn('[win-helper]', String(d).trim()));
    p.on('error', (e) => console.error('[win-helper]', e.message));
    p.on('exit', () => {
      this.proc = null;
      for (const w of this.waiters.values()) w(null);
      this.waiters.clear();
      if (!this.stopped) setTimeout(() => this._spawn(), 3000);
    });
    this.proc = p;
  }

  _onLine(line) {
    const sp = line.indexOf(' ');
    if (sp < 0) return;
    const w = this.waiters.get(line.slice(0, sp));
    if (!w) return;
    this.waiters.delete(line.slice(0, sp));
    try { w(JSON.parse(line.slice(sp + 1))); } catch { w(null); }
  }

  _cmd(...args) {
    return new Promise((resolve) => {
      if (!this.proc) return resolve(null);
      const id = String(++this.seq);
      const t = setTimeout(() => { if (this.waiters.delete(id)) resolve(null); }, 5000);
      this.waiters.set(id, (v) => { clearTimeout(t); resolve(v); });
      this.proc.stdin.write(`${id} ${args.join(' ')}\n`);
    });
  }

  async getActive() {
    const r = await this._cmd('active');
    if (!r || !r.hwnd) return null;
    const { screen } = require('electron');
    let bounds = { x: r.x, y: r.y, width: r.w, height: r.h };
    try { bounds = screen.screenToDipRect(null, bounds); } catch { /* garde les pixels physiques */ }
    return { handle: String(r.hwnd), pid: r.pid, process: r.proc || '', app: r.desc || r.proc || '', title: r.title || '', bounds };
  }

  // URL affichée dans la barre d'adresse (sans extension). Chrome masque "https://" : on le remet.
  async getUrl(win) {
    const r = await this._cmd('url', win.handle);
    const raw = r && typeof r.url === 'string' ? r.url.trim() : '';
    if (!raw || /\s/.test(raw)) return '';
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  // Ctrl+W dans le navigateur (seulement s'il est toujours au premier plan)
  closeTab(win) { return this._cmd('closetab', win.handle); }

  // WM_CLOSE : fermeture "propre" de la fenêtre
  closeApp(win) { return this._cmd('close', win.handle); }

  quitApps(names) {
    for (const n of names) {
      const exe = String(n).trim().replace(/\.exe$/i, '');
      if (!/^[\w .+-]+$/.test(exe)) continue;
      execFile('taskkill', ['/IM', `${exe}.exe`, '/T', '/F'], { windowsHide: true }, () => {});
    }
  }

  // Coupe les bannières de notification Windows (meilleur effort : même clé que le réglage système)
  setDnd(on) {
    execFile('reg', ['add', NOTIF_KEY, '/v', 'NOC_GLOBAL_SETTING_TOASTS_ENABLED', '/t', 'REG_DWORD', '/d', on ? '0' : '1', '/f'], { windowsHide: true }, () => {});
  }

  openNotificationSettings() {
    require('electron').shell.openExternal('ms-settings:notifications');
  }

  stop() {
    this.stopped = true;
    if (this.proc) this.proc.kill();
  }
}

module.exports = WinPlatform;
