"""
companion_updater.py — Auto-update logic: version check, download, and apply.
"""
import re, json, os, sys, hashlib, shutil, tempfile, time, threading, subprocess
from pathlib import Path

import companion_state as state

APP_VERSION = state.APP_VERSION
DEFAULT_UPDATE_MANIFEST_URL = state.DEFAULT_UPDATE_MANIFEST_URL

_UPDATE_STATUS_LOCK = threading.Lock()
_UPDATE_STATUS = {
    'running': False,
    'phase': 'idle',
    'percent': 0,
    'downloaded': 0,
    'total': 0,
    'target_version': '',
    'package_url': '',
    'package_path': '',
    'log_path': '',
    'error': '',
    'started_at': '',
    'updated_at': '',
}


def _now_text() -> str:
    return time.strftime('%Y-%m-%d %H:%M:%S')


def _set_update_status(**updates) -> dict:
    with _UPDATE_STATUS_LOCK:
        _UPDATE_STATUS.update(updates)
        _UPDATE_STATUS['updated_at'] = _now_text()
        return dict(_UPDATE_STATUS)


def _get_update_status() -> dict:
    with _UPDATE_STATUS_LOCK:
        return dict(_UPDATE_STATUS)


def _update_prompt_config() -> dict:
    return dict(state._CONFIG_CACHE.get('update_prompt') or {})


def _save_update_prompt_config(prompt: dict) -> None:
    try:
        from companion_config import _load_config, _save_config

        cfg = _load_config()
        cfg['update_prompt'] = prompt
        _save_config(cfg)
        state._CONFIG_CACHE = cfg
    except Exception as exc:
        print(f'[Update] save prompt state failed: {exc}', flush=True)


def _should_prompt_update(version: str, now_ts: float | None = None) -> bool:
    version = str(version or '').strip()
    if not version:
        return False
    now_ts = float(now_ts or time.time())
    prompt = _update_prompt_config()
    snoozed_until = float(prompt.get('snoozed_until') or 0)
    if snoozed_until and now_ts < snoozed_until:
        return False
    if str(prompt.get('last_version') or '') == version:
        last_shown_at = float(prompt.get('last_shown_at') or 0)
        if last_shown_at and now_ts - last_shown_at < 24 * 3600:
            return False
    return True


def _mark_update_prompt_shown(version: str) -> dict:
    prompt = _update_prompt_config()
    prompt.update({
        'last_version': str(version or '').strip(),
        'last_shown_at': time.time(),
    })
    _save_update_prompt_config(prompt)
    return prompt


def _snooze_update_prompt(version: str, hours: int = 24) -> dict:
    prompt = _update_prompt_config()
    prompt.update({
        'last_version': str(version or '').strip(),
        'last_shown_at': time.time(),
        'snoozed_until': time.time() + max(1, int(hours or 24)) * 3600,
    })
    _save_update_prompt_config(prompt)
    return prompt


def _begin_update_status(target_version: str, package_url: str, total: int = 0) -> dict:
    return _set_update_status(
        running=True,
        phase='queued',
        percent=0,
        downloaded=0,
        total=int(total or 0),
        target_version=str(target_version or ''),
        package_url=str(package_url or ''),
        package_path='',
        log_path='',
        error='',
        started_at=_now_text(),
    )


def _finish_update_status(phase: str = 'restarting', log_path: str = '') -> dict:
    return _set_update_status(
        running=True,
        phase=phase,
        percent=100,
        log_path=str(log_path or ''),
        error='',
    )


def _fail_update_status(error: Exception | str) -> dict:
    return _set_update_status(
        running=False,
        phase='error',
        error=str(error),
    )


def _emit_progress(progress_cb, **updates) -> None:
    if progress_cb:
        progress_cb(**updates)

def _parse_version_parts(value: str):
    return [int(part) for part in re.findall(r'\d+', str(value or ''))]


def _is_newer_version(remote_version: str, current_version: str = APP_VERSION) -> bool:
    remote = _parse_version_parts(remote_version)
    current = _parse_version_parts(current_version)
    size = max(len(remote), len(current), 1)
    remote += [0] * (size - len(remote))
    current += [0] * (size - len(current))
    return remote > current


def _get_update_manifest_url() -> str:
    return str(state._CONFIG_CACHE.get('update_manifest_url') or DEFAULT_UPDATE_MANIFEST_URL).strip()


def _resolve_update_url(manifest_url: str, package_url: str) -> str:
    import urllib.parse
    return urllib.parse.urljoin(manifest_url, str(package_url or '').strip())


def _fetch_update_manifest() -> dict:
    import time
    import urllib.parse
    import urllib.request

    manifest_url = _get_update_manifest_url()
    if not manifest_url:
        raise RuntimeError('update manifest url is empty')
    parsed = urllib.parse.urlparse(manifest_url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query.append(('_', str(int(time.time()))))
    cache_busted_url = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(query)))
    req = urllib.request.Request(
        cache_busted_url,
        headers={
            'Accept': 'application/json',
            'User-Agent': f'pixingyun-mate/{APP_VERSION}',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read(1024 * 1024)
    manifest = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(manifest, dict):
        raise RuntimeError('update manifest must be a json object')
    return manifest


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _download_update_package(package_url: str, expected_sha256: str, progress_cb=None, expected_size: int = 0) -> Path:
    import urllib.parse
    import urllib.request
    import urllib.error

    parsed = urllib.parse.urlparse(package_url)
    if parsed.scheme not in ('http', 'https'):
        raise RuntimeError('update package url must use http or https')
    expected_sha256 = (expected_sha256 or '').strip().lower()
    if not re.fullmatch(r'[0-9a-fA-F]{64}', expected_sha256):
        raise RuntimeError('update package sha256 is missing or invalid')
    expected_size = int(expected_size or 0)

    download_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-download-'))
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in ('.zip', '.exe'):
        raise RuntimeError('update package must be a .zip or .exe file')
    package_path = download_dir / f'update{suffix}'
    total = expected_size
    max_attempts = 5
    last_error = None
    for attempt in range(1, max_attempts + 1):
        downloaded = package_path.stat().st_size if package_path.exists() else 0
        if expected_size > 0 and downloaded > expected_size:
            package_path.unlink(missing_ok=True)
            downloaded = 0
        headers = {
            'User-Agent': f'pixingyun-mate/{APP_VERSION}',
            'Cache-Control': 'no-cache',
        }
        if downloaded > 0:
            headers['Range'] = f'bytes={downloaded}-'
        req = urllib.request.Request(package_url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                status_code = int(getattr(resp, 'status', 200) or 200)
                if downloaded > 0 and status_code != 206:
                    package_path.unlink(missing_ok=True)
                    downloaded = 0
                    file_mode = 'wb'
                else:
                    file_mode = 'ab' if downloaded > 0 else 'wb'

                content_length = int(resp.headers.get('Content-Length') or 0)
                if not total:
                    total = downloaded + content_length if content_length > 0 else 0
                if expected_size > 0:
                    total = expected_size
                _emit_progress(
                    progress_cb,
                    phase='downloading',
                    total=total,
                    downloaded=downloaded,
                    percent=int(downloaded * 100 / total) if total > 0 else 0,
                )
                with package_path.open(file_mode) as fh:
                    while True:
                        chunk = resp.read(1024 * 1024)
                        if not chunk:
                            break
                        fh.write(chunk)
                        downloaded += len(chunk)
                        percent = int(downloaded * 100 / total) if total > 0 else 0
                        _emit_progress(
                            progress_cb,
                            phase='downloading',
                            total=total,
                            downloaded=downloaded,
                            percent=min(percent, 99),
                        )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        downloaded = package_path.stat().st_size if package_path.exists() else 0
        if expected_size > 0 and downloaded == expected_size:
            break
        if expected_size <= 0 and total > 0 and downloaded >= total:
            break
        if attempt < max_attempts:
            _emit_progress(
                progress_cb,
                phase='downloading',
                total=total,
                downloaded=downloaded,
                percent=int(downloaded * 100 / total) if total > 0 else 0,
            )
            time.sleep(min(2 * attempt, 8))
    downloaded = package_path.stat().st_size if package_path.exists() else 0
    if expected_size > 0 and downloaded != expected_size:
        detail = f'downloaded {downloaded}/{expected_size} bytes'
        if last_error:
            detail += f'; last error: {last_error}'
        raise RuntimeError(f'update package incomplete: {detail}')
    _emit_progress(
        progress_cb,
        phase='verifying',
        total=total or downloaded,
        downloaded=downloaded,
        percent=99,
        package_path=str(package_path),
    )
    actual_sha256 = _sha256_file(package_path)
    if actual_sha256.lower() != expected_sha256:
        raise RuntimeError('update package sha256 mismatch')
    _emit_progress(
        progress_cb,
        phase='verified',
        total=downloaded,
        downloaded=downloaded,
        percent=100,
        package_path=str(package_path),
    )
    return package_path


def _ps_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _vbs_quote(value: str) -> str:
    """Quote a string for VBScript, doubling embedded double quotes."""
    return '"' + str(value).replace('"', '""') + '"'


def _launch_hidden_process(ps1_path: Path, work_dir: Path) -> None:
    """Launch a PowerShell script completely invisibly via a VBScript launcher.

    On Windows, ``cmd /c`` always flashes a console window even with
    ``CREATE_NO_WINDOW``, and ``-WindowStyle Hidden`` only takes effect
    *after* PowerShell has already started (brief flash).

    VBScript's ``WshShell.Run …, 0, True`` launches the target with window
    style 0 (SW_HIDE) from the very first instruction — no window ever
    appears.  ``wscript.exe`` itself has no UI.  This works on every
    Windows version from 7 through 11 and does not depend on PowerShell
    execution policy (we pass ``-ExecutionPolicy Bypass``).
    """
    vbs_path = work_dir / 'run_update.vbs'
    vbs_content = (
        'Set WshShell = CreateObject("WScript.Shell")\r\n'
        f'WshShell.Run {_vbs_quote("powershell -NoProfile -ExecutionPolicy Bypass -File " + chr(34) + str(ps1_path) + chr(34))}, 0, True\r\n'
    )
    vbs_path.write_text(vbs_content, encoding='utf-8')

    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= getattr(subprocess, 'STARTF_USESHOWWINDOW', 0)
    startupinfo.wShowWindow = 0  # SW_HIDE
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    subprocess.Popen(
        ['wscript.exe', str(vbs_path)],
        cwd=str(work_dir),
        creationflags=creationflags,
        startupinfo=startupinfo,
    )


def _start_exe_update_process(new_exe_path: Path, target_version: str = '') -> Path:
    """Replace the current portable exe with a downloaded new exe.

    The downloaded file is a PyInstaller ``--onefile`` executable, *not* an
    Inno Setup installer.  We simply wait for the current process to exit,
    back up the old exe, copy the new one in place, unblock it, and restart.
    """
    if not getattr(sys, 'frozen', False):
        raise RuntimeError('self update is only available in the packaged app')

    work_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-'))
    log_path = work_dir / 'exe-update.log'
    ps1_path = work_dir / 'apply_exe_update.ps1'

    exe_path = Path(sys.executable).resolve()
    app_dir = exe_path.parent
    expected_version = str(target_version or '').strip()

    ps1_path.write_text(f"""$ErrorActionPreference = 'Stop'
$PidToWait = {os.getpid()}
$NewExePath = {_ps_quote(str(new_exe_path.resolve()))}
$ExePath = {_ps_quote(str(exe_path))}
$AppDir = {_ps_quote(str(app_dir))}
$LogPath = {_ps_quote(str(log_path))}
$ExpectedVersion = {_ps_quote(expected_version)}
$BackupRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MatrixFlow\\update-backups'
$BackupDir = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
$PyInstallerTmp = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MatrixFlow\\pyinstaller-tmp'

function Write-UpdateLog([string]$Message) {{
  $Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "$Timestamp $Message" | Add-Content -LiteralPath $LogPath
}}

function Test-CompanionHealth([string]$Version) {{
  try {{
    $Response = Invoke-RestMethod -Uri 'http://127.0.0.1:5409/health' -TimeoutSec 3
    if ($Response.status -ne 'ok') {{ return $false }}
    if ([string]::IsNullOrWhiteSpace($Version)) {{ return $true }}
    return ([string]$Response.version -eq $Version)
  }} catch {{
    return $false
  }}
}}

try {{
  Write-UpdateLog "Waiting for pid $PidToWait"
  Wait-Process -Id $PidToWait -Timeout 90 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  New-Item -ItemType Directory -Path $PyInstallerTmp -Force | Out-Null
  $BackupExe = Join-Path $BackupDir (Split-Path $ExePath -Leaf)
  Copy-Item -LiteralPath $ExePath -Destination $BackupExe -Force
  Write-UpdateLog "Backed up old exe to $BackupExe"
  Copy-Item -LiteralPath $NewExePath -Destination $ExePath -Force
  Write-UpdateLog "Copied new exe to $ExePath"
  try {{ Unblock-File -LiteralPath $ExePath -ErrorAction SilentlyContinue }} catch {{}}
  Get-ChildItem -LiteralPath $PyInstallerTmp -Directory -Filter '_MEI*' -ErrorAction SilentlyContinue | Where-Object {{
    $_.LastWriteTime -lt (Get-Date).AddHours(-6)
  }} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  [Environment]::SetEnvironmentVariable('TEMP', $PyInstallerTmp, 'Process')
  [Environment]::SetEnvironmentVariable('TMP', $PyInstallerTmp, 'Process')
  $Started = Start-Process -FilePath $ExePath -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
  Write-UpdateLog "Started new exe pid=$($Started.Id), expectedVersion=$ExpectedVersion"
  $Healthy = $false
  for ($i = 0; $i -lt 30; $i++) {{
    Start-Sleep -Seconds 2
    if (Test-CompanionHealth $ExpectedVersion) {{
      $Healthy = $true
      break
    }}
    try {{
      $Started.Refresh()
      if ($Started.HasExited) {{
        Write-UpdateLog "New exe exited before health check, exitCode=$($Started.ExitCode)"
        break
      }}
    }} catch {{}}
  }}
  if (-not $Healthy) {{
    try {{
      if ($Started -and -not $Started.HasExited) {{
        Stop-Process -Id $Started.Id -Force -ErrorAction SilentlyContinue
      }}
    }} catch {{}}
    Copy-Item -LiteralPath $BackupExe -Destination $ExePath -Force
    try {{ Unblock-File -LiteralPath $ExePath -ErrorAction SilentlyContinue }} catch {{}}
    Start-Process -FilePath $ExePath -WorkingDirectory $AppDir -WindowStyle Hidden
    throw "updated exe did not pass health check; restored previous version"
  }}
  Write-UpdateLog "Update health check passed"
}} catch {{
  if (Test-Path $BackupExe) {{
    try {{ Copy-Item -LiteralPath $BackupExe -Destination $ExePath -Force }} catch {{}}
  }}
  $_ | Out-String | Add-Content -LiteralPath $LogPath
  exit 1
}}
""", encoding='utf-8')

    _launch_hidden_process(ps1_path, work_dir)

    def _exit_after_response():
        time.sleep(1.0)
        os._exit(0)

    threading.Thread(target=_exit_after_response, daemon=True).start()
    return log_path


def _start_zip_update_process(zip_path: Path, target_version: str = '') -> Path:
    if not getattr(sys, 'frozen', False):
        raise RuntimeError('self update is only available in the packaged app')

    app_dir = Path(sys.executable).resolve().parent
    exe_path = Path(sys.executable).resolve()
    work_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-'))
    stage_dir = work_dir / 'stage'
    log_path = work_dir / 'update.log'
    ps1_path = work_dir / 'apply_update.ps1'
    expected_version = str(target_version or '').strip()

    ps1_path.write_text(f"""$ErrorActionPreference = 'Stop'
$PidToWait = {os.getpid()}
$AppDir = {_ps_quote(str(app_dir))}
$ExePath = {_ps_quote(str(exe_path))}
$ZipPath = {_ps_quote(str(zip_path.resolve()))}
$StageDir = {_ps_quote(str(stage_dir))}
$LogPath = {_ps_quote(str(log_path))}
$ExpectedVersion = {_ps_quote(expected_version)}
$BackupRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MatrixFlow\\update-backups'
$BackupDir = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
$ExcludedNames = @('companion_config.json', 'browser-profiles', 'chrome_profile', 'accounts.db', 'cookies_copy.db')
$ExcludedExtensions = @('.db', '.sqlite', '.sqlite3', '.wal', '.shm')

function Write-UpdateLog([string]$Message) {{
  $Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  "$Timestamp $Message" | Add-Content -LiteralPath $LogPath
}}

function Test-CompanionHealth([string]$Version) {{
  try {{
    $Response = Invoke-RestMethod -Uri 'http://127.0.0.1:5409/health' -TimeoutSec 3
    if ($Response.status -ne 'ok') {{ return $false }}
    if ([string]::IsNullOrWhiteSpace($Version)) {{ return $true }}
    return ([string]$Response.version -eq $Version)
  }} catch {{
    return $false
  }}
}}

try {{
  Write-UpdateLog "Waiting for pid $PidToWait"
  Wait-Process -Id $PidToWait -Timeout 90 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Remove-Item -LiteralPath $StageDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $StageDir -Force
  $Candidate = Get-ChildItem -LiteralPath $StageDir -Directory | Where-Object {{ Test-Path (Join-Path $_.FullName 'pixingyun-mate.exe') }} | Select-Object -First 1
  if ($Candidate) {{
    $SourceDir = $Candidate.FullName
  }} else {{
    $SourceDir = $StageDir
  }}
  Get-ChildItem -LiteralPath $AppDir -Force | Where-Object {{
    ($ExcludedNames -notcontains $_.Name) -and ($ExcludedExtensions -notcontains $_.Extension.ToLowerInvariant())
  }} | ForEach-Object {{
    Copy-Item -LiteralPath $_.FullName -Destination $BackupDir -Recurse -Force
  }}
  # Backup config before overwrite (safety net — config should already
  # be in AppData, but keep this in case of legacy installs)
  $CfgBackup = Join-Path $AppDir 'companion_config.json'
  $CfgPreserved = $null
  if (Test-Path $CfgBackup) {{
    $CfgPreserved = Copy-Item -LiteralPath $CfgBackup -Destination ([System.IO.Path]::GetTempPath() + 'pixingyun_config_backup.json') -Force -PassThru
  }}
  Get-ChildItem -LiteralPath $SourceDir -Force | Where-Object {{
    ($ExcludedNames -notcontains $_.Name) -and ($ExcludedExtensions -notcontains $_.Extension.ToLowerInvariant())
  }} | ForEach-Object {{
    Copy-Item -LiteralPath $_.FullName -Destination $AppDir -Recurse -Force
  }}
  # Restore config if it was backed up
  if ($CfgPreserved -and (Test-Path $CfgPreserved.FullName)) {{
    Copy-Item -LiteralPath $CfgPreserved.FullName -Destination $CfgBackup -Force
    Remove-Item -LiteralPath $CfgPreserved.FullName -Force -ErrorAction SilentlyContinue
  }}
  # Remove Mark-of-the-Web so SmartScreen doesn't block the new exe
  Get-ChildItem -LiteralPath $AppDir -Filter '*.exe' -Force | ForEach-Object {{
    try {{ Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue }} catch {{}}
  }}
  $Started = Start-Process -FilePath $ExePath -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
  Write-UpdateLog "Started new exe pid=$($Started.Id), expectedVersion=$ExpectedVersion"
  $Healthy = $false
  for ($i = 0; $i -lt 30; $i++) {{
    Start-Sleep -Seconds 2
    if (Test-CompanionHealth $ExpectedVersion) {{
      $Healthy = $true
      break
    }}
    try {{
      $Started.Refresh()
      if ($Started.HasExited) {{
        Write-UpdateLog "New exe exited before health check, exitCode=$($Started.ExitCode)"
        break
      }}
    }} catch {{}}
  }}
  if (-not $Healthy) {{
    try {{
      if ($Started -and -not $Started.HasExited) {{
        Stop-Process -Id $Started.Id -Force -ErrorAction SilentlyContinue
      }}
    }} catch {{}}
    Get-ChildItem -LiteralPath $BackupDir -Force | ForEach-Object {{
      Copy-Item -LiteralPath $_.FullName -Destination $AppDir -Recurse -Force
    }}
    Start-Process -FilePath $ExePath -WorkingDirectory $AppDir -WindowStyle Hidden
    throw "updated app did not pass health check; restored previous version"
  }}
  Write-UpdateLog "Update health check passed"
}} catch {{
  $_ | Out-String | Add-Content -LiteralPath $LogPath
  exit 1
}}
""", encoding='utf-8')

    _launch_hidden_process(ps1_path, work_dir)

    def _exit_after_response():
        time.sleep(1.0)
        os._exit(0)

    threading.Thread(target=_exit_after_response, daemon=True).start()
    return log_path


def _start_update_process(package_path: Path, target_version: str = '') -> Path:
    suffix = package_path.suffix.lower()
    if suffix == '.exe':
        return _start_exe_update_process(package_path, target_version)
    if suffix == '.zip':
        return _start_zip_update_process(package_path, target_version)
    raise RuntimeError('update package must be a .zip or .exe file')
