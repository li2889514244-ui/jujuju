"""
companion_updater.py — Auto-update logic: version check, download, and apply.
"""
import re, json, os, sys, hashlib, shutil, tempfile, time, threading, subprocess
from pathlib import Path

import companion_state as state
from companion_encoding import write_text_file

APP_VERSION = state.APP_VERSION
DEFAULT_UPDATE_MANIFEST_URL = state.DEFAULT_UPDATE_MANIFEST_URL

_UPDATE_STATUS_LOCK = threading.Lock()

# 更新检查与下载统一走“无系统代理”通道：同事机器若挂着 Clash/VPN，
# 系统代理会把几百 MB 的更新包绕到代理节点，速度极慢。更新包必须直连。
import urllib.request as _urllib_request

_NO_PROXY_OPENER = _urllib_request.build_opener(_urllib_request.ProxyHandler({}))

# 下载暂停/继续：用户点“暂停下载”置位，点“继续下载”清除；下载循环按块检查。
_DOWNLOAD_PAUSE = threading.Event()


class _DownloadPaused(Exception):
    """内部信号：下载被用户暂停（分片文件保留，继续时从断点恢复）。"""


def pause_download() -> None:
    _DOWNLOAD_PAUSE.set()


def resume_download() -> None:
    _DOWNLOAD_PAUSE.clear()


def is_download_paused() -> bool:
    return _DOWNLOAD_PAUSE.is_set()
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
        # 强提醒：同一版本每 30 分钟重复弹出，直到用户更新或手动延迟
        if last_shown_at and now_ts - last_shown_at < 30 * 60:
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


def _snooze_update_prompt(version: str, minutes: int = 30) -> dict:
    prompt = _update_prompt_config()
    prompt.update({
        'last_version': str(version or '').strip(),
        'last_shown_at': time.time(),
        'snoozed_until': time.time() + max(1, int(minutes or 30)) * 60,
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


def _friendly_update_failure(error: Exception | str) -> str:
    """统一的更新失败提示：停止更新并提示用户重新尝试，避免反复弹窗重试。"""
    detail = str(error or '').strip().replace('\n', ' ')[:200]
    return f'自动更新失败，请重新尝试。{detail}'


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


def choose_update_package(manifest: dict, manifest_url: str = '') -> tuple[str, str, int]:
    """选择更新包：优先轻量包（不含内置浏览器，约 160MB），仅当本地已有内置
    浏览器目录时才可用；否则回退到全量包。返回 (package_url, sha256, size)。"""
    full_url = _resolve_update_url(
        manifest_url or _get_update_manifest_url(),
        manifest.get('full_url') or manifest.get('url') or manifest.get('package_url') or '',
    )
    full_sha = str(manifest.get('full_sha256') or manifest.get('sha256') or '').strip()
    full_size = int(manifest.get('full_size') or manifest.get('size') or manifest.get('package_size') or 0)

    lite_url_raw = manifest.get('lite_url') or ''
    if lite_url_raw:
        try:
            app_dir = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
            has_chromium = any((app_dir / '_internal' / 'ms-playwright').glob('chromium-*'))
            if has_chromium:
                return (
                    _resolve_update_url(manifest_url or _get_update_manifest_url(), str(lite_url_raw)),
                    str(manifest.get('lite_sha256') or '').strip(),
                    int(manifest.get('lite_size') or 0),
                )
        except Exception:
            pass
    return (full_url, full_sha, full_size)


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
    with _NO_PROXY_OPENER.open(req, timeout=45) as resp:
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


def _supports_ranges(package_url: str) -> bool:
    req = _urllib_request.Request(
        package_url,
        headers={'User-Agent': f'pixingyun-mate/{APP_VERSION}', 'Range': 'bytes=0-0'},
    )
    with _NO_PROXY_OPENER.open(req, timeout=30) as resp:
        return resp.status == 206 and 'bytes' in (resp.headers.get('Content-Range') or '')


def _parallel_download(package_url: str, target: Path, total: int, workers: int, progress_cb=None) -> None:
    """多线程分片下载：把更新包切成 N 段并发拉取，显著提升慢链路下的吞吐。

    支持暂停/继续：暂停时各分片保留已下载部分，继续时按分片断点续传。
    """
    part_size = (total + workers - 1) // workers
    downloaded = [0] * workers
    errors: list = []
    lock = threading.Lock()

    def _worker(idx: int) -> None:
        try:
            start = idx * part_size
            end = min(total - 1, start + part_size - 1)
            if start > end:
                return
            part_path = target.with_suffix(target.suffix + f'.part{idx}')
            offset = part_path.stat().st_size if part_path.exists() else 0
            if offset >= end - start + 1:
                with lock:
                    downloaded[idx] = end - start + 1
                return
            req_start = start + offset
            req = _urllib_request.Request(
                package_url,
                headers={
                    'User-Agent': f'pixingyun-mate/{APP_VERSION}',
                    'Range': f'bytes={req_start}-{end}',
                    'Cache-Control': 'no-cache',
                },
            )
            with _NO_PROXY_OPENER.open(req, timeout=300) as resp:
                with part_path.open('ab') as fh:
                    while True:
                        if is_download_paused():
                            raise _DownloadPaused()
                        chunk = resp.read(1024 * 1024)
                        if not chunk:
                            break
                        fh.write(chunk)
                        with lock:
                            downloaded[idx] += len(chunk)
                            total_dl = sum(downloaded)
                            if total > 0:
                                _emit_progress(
                                    progress_cb,
                                    phase='downloading',
                                    total=total,
                                    downloaded=total_dl,
                                    percent=min(int(total_dl * 100 / total), 99),
                                )
        except _DownloadPaused as exc:
            with lock:
                errors.append(exc)
        except Exception as exc:
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=_worker, args=(i,), daemon=True) for i in range(workers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    if errors:
        raise errors[0]

    with target.open('wb') as out:
        for idx in range(workers):
            part_path = target.with_suffix(target.suffix + f'.part{idx}')
            if part_path.exists():
                out.write(part_path.read_bytes())
                part_path.unlink(missing_ok=True)
    _emit_progress(progress_cb, phase='downloading', total=total, downloaded=total, percent=100)


def _sequential_probe(
    package_url: str,
    target: Path,
    total: int,
    probe_seconds: float = 2.5,
) -> int:
    """单线程探测下载：最多跑 probe_seconds 秒，返回这段时间内新下载的字节数。"""
    downloaded0 = target.stat().st_size if target.exists() else 0
    headers = {
        'User-Agent': f'pixingyun-mate/{APP_VERSION}',
        'Cache-Control': 'no-cache',
    }
    if downloaded0 > 0:
        headers['Range'] = f'bytes={downloaded0}-'
    req = _urllib_request.Request(package_url, headers=headers)
    deadline = time.time() + probe_seconds
    with _NO_PROXY_OPENER.open(req, timeout=180) as resp:
        status = int(getattr(resp, 'status', 200) or 200)
        file_mode = 'ab' if downloaded0 > 0 and status == 206 else 'wb'
        if file_mode == 'wb':
            downloaded0 = 0
        with target.open(file_mode) as fh:
            while time.time() < deadline:
                if is_download_paused():
                    raise _DownloadPaused()
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                fh.write(chunk)
    return target.stat().st_size - downloaded0


def _download_update_package(
    package_url: str,
    expected_sha256: str,
    progress_cb=None,
    expected_size: int = 0,
    work_dir: Path | None = None,
) -> Path:
    """下载更新包。work_dir 指定时复用目录（暂停/继续时保留已下载数据以便断点续传）。"""
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

    if work_dir is not None:
        download_dir = Path(work_dir)
        download_dir.mkdir(parents=True, exist_ok=True)
    else:
        download_dir = Path(tempfile.mkdtemp(prefix='pixingyun-update-download-'))
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in ('.zip', '.exe'):
        raise RuntimeError('update package must be a .zip or .exe file')
    package_path = download_dir / f'update{suffix}'
    total = expected_size
    max_attempts = 5
    last_error = None

    # ── 自适应加速：先单线程探测 ~2.5 秒测速 ──
    # 慢链路（<300KB/s，常见于代理/跨网/单连接限速）→ 切 8 线程分片并发；
    # 快链路 → 保持单线程（本机实测单线程已跑满带宽时略优于并发）。
    if expected_size > 8 * 1024 * 1024:
        try:
            if _supports_ranges(package_url):
                probe_started = time.time()
                probe_bytes = _sequential_probe(package_url, package_path, expected_size, probe_seconds=2.5)
                probe_elapsed = max(time.time() - probe_started, 0.1)
                if package_path.exists() and package_path.stat().st_size >= expected_size:
                    return package_path
                rate = probe_bytes / probe_elapsed
                print(f'[Update] probe: {probe_bytes} bytes in {probe_elapsed:.1f}s = {rate/1024:.0f} KB/s')
                if rate < 300 * 1024:
                    print('[Update] slow link detected, switching to 8-thread parallel download')
                    package_path.unlink(missing_ok=True)
                    _parallel_download(package_url, package_path, expected_size, 8, progress_cb)
                    if package_path.exists() and package_path.stat().st_size == expected_size:
                        return package_path
        except _DownloadPaused:
            raise
        except Exception as exc:
            print(f'[Update] adaptive fast path failed, falling back to sequential: {exc}')
            try:
                package_path.unlink(missing_ok=True)
                for part in download_dir.glob(f'update{suffix}.part*'):
                    part.unlink(missing_ok=True)
            except Exception:
                pass

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
            with _NO_PROXY_OPENER.open(req, timeout=180) as resp:
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
                        if is_download_paused():
                            raise _DownloadPaused()
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


def _validate_generated_script(path: Path) -> None:
    """生成更新脚本后的自动验证（先验码、再执行）。

    检查顺序：文件可读 → 非空 → UTF-8（BOM 可选）解码成功 → 无替换符/空字节 →
    首个非空白字符是合法 PowerShell 语句起始字符。
    任何一项不过 → 抛错，更新流程停止并提示"自动更新失败，请重新尝试。"，
    绝不带病执行、也绝不弹 Windows Script Host 窗口。
    """
    try:
        raw = path.read_bytes()
    except Exception as exc:
        raise RuntimeError('自动更新失败，请重新尝试。（更新脚本无法读取）') from exc
    if not raw.strip(b'\xef\xbb\xbf \t\r\n'):
        raise RuntimeError('自动更新失败，请重新尝试。（更新脚本为空）')
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise RuntimeError('自动更新失败，请重新尝试。（更新脚本编码异常）') from exc
    if '\ufffd' in text or '\x00' in text:
        raise RuntimeError('自动更新失败，请重新尝试。（更新脚本含非法字符）')
    first = text.lstrip('\ufeff \t\r\n')[:1]
    allowed = '$#abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if first and first not in allowed:
        raise RuntimeError(f'自动更新失败，请重新尝试。（更新脚本首字符非法: {first!r}）')


def _launch_hidden_process(ps1_path: Path, work_dir: Path) -> None:
    """以完全无窗口的方式启动生成的 PowerShell 更新脚本。

    P0 修复：不再生成 run_update.vbs。
    旧实现把 .vbs 以 UTF-8-SIG（带 BOM）写出，Windows Script Host 不认 UTF-8 BOM，
    首字节 EF BB BF 被 wscript 当作非法字符，报 800A0408「无效字符」并弹错误窗口。
    现改为直接隐藏启动 powershell.exe：
      - CREATE_NO_WINDOW 不创建新控制台；
      - STARTF_USESHOWWINDOW + SW_HIDE 使窗口从一开始就不显示（无闪烁）；
      - 执行前先通过 _validate_generated_script 校验脚本编码/非空/首字符。
    """
    _validate_generated_script(ps1_path)

    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= getattr(subprocess, 'STARTF_USESHOWWINDOW', 0)
    startupinfo.wShowWindow = 0  # SW_HIDE
    creationflags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    subprocess.Popen(
        [
            'powershell.exe',
            '-NoLogo', '-NoProfile', '-NonInteractive',
            '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', str(ps1_path),
        ],
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

    write_text_file(ps1_path, f"""$ErrorActionPreference = 'Stop'
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
        $Started.Kill()
        try {{ $Started.WaitForExit(5000) | Out-Null }} catch {{}}
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
""", bom=True)

    _validate_generated_script(ps1_path)
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

    write_text_file(ps1_path, f"""$ErrorActionPreference = 'Stop'
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
        $Started.Kill()
        try {{ $Started.WaitForExit(5000) | Out-Null }} catch {{}}
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
""", bom=True)

    _validate_generated_script(ps1_path)
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
