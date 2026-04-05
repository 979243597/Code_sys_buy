# Source Generated with Decompyle++
# File: AI Deployer V1.0.4.pyc (Python 3.9)

'''
AI Code Assistant Deployer
一键激活工具
支持 Windows / macOS / Linux
'''
import sys
import os
import json
import shutil
import platform
import subprocess
import hashlib
import uuid
from pathlib import Path
from datetime import datetime
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QLineEdit, QCheckBox, QTextEdit, QFrame, QMessageBox
from PyQt5.QtCore import Qt, pyqtSignal, QThread, QUrl, QTimer
from PyQt5.QtGui import QColor, QPainter, QPainterPath, QLinearGradient, QBrush, QPen, QIcon, QDesktopServices

try:
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


def _safe_request(method, url, **kwargs):
    '''发送 HTTP 请求，SSL 失败时自动降级重试（verify=False）'''
    kwargs.setdefault('timeout', 15)
    
    try:
        return getattr(requests, method)(url, **kwargs)
    except (requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
        if 'ssl' in str(e).lower() or 'eof' in str(e).lower():
            kwargs['verify'] = False
            return getattr(requests, method)(url, **kwargs)
        raise 


APP_NAME = 'AI Deployer V1.0.4'
APP_VERSION = '1.0.4'
_EP = 'aHR0cHM6Ly9jb2RleC5haTAyLmNu'
(WINDOW_W, WINDOW_H) = (540, 720)
RADIUS = 16
_DEFAULT_CODEX_MODEL = 'gpt-5.3-codex'
_DEFAULT_OC_MODEL = 'openai/gpt-5.3-codex'
_DEFAULT_OC_SMALL = 'openai/gpt-4.1-mini'
_SETTINGS_FILE = Path.home() / '.ai_deployer_settings.json'

def _find_icon():
    '''自动识别程序所在目录下的 .ico / .icns 文件'''
    candidates = []
    if getattr(sys, 'frozen', False):
        meipass = getattr(sys, '_MEIPASS', None)
        if meipass:
            candidates.append(Path(meipass))
        candidates.append(Path(sys.executable).parent)
    else:
        candidates.append(Path(__file__).parent)
    for base in candidates:
        for ico in base.glob('*.ico'):
            return str(ico)
        for icns in base.glob('*.icns'):
            return str(icns)
    return ''


def _get_base_url():
    import base64
    return base64.b64decode(_EP).decode()


def _get_device_hash():
    '''生成设备指纹 (MAC + 主机名 的哈希)'''
    
    try:
        mac = uuid.getnode()
        hostname = platform.node()
        raw = f'''{mac}-{hostname}'''
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
    except Exception:
        return 'unknown'



def _redeem_card(code):
    '''调用服务端兑换卡密，返回 (success, data_dict_or_msg)'''
    if not HAS_REQUESTS:
        return (False, '缺少 requests 库')
    
    try:
        url = f'''{_get_base_url()}/api/redeem'''
        resp = _safe_request('post', url, json = {
            'code': code.strip().upper(),
            'device_hash': _get_device_hash() })
        data = resp.json()
        if data.get('success'):
            return (True, {
                'key': data['key'],
                'expires_at': data.get('expires_at', '') })
        return (False, data.get('message', '兑换失败'))
    except Exception as e:
        return (False, f'''网络错误: {e}''')



def _query_usage(code):
    '''查询卡密用量，返回 (success, data_dict_or_msg)'''
    if not HAS_REQUESTS:
        return (False, '缺少 requests 库')
    
    try:
        url = f'''{_get_base_url()}/api/usage'''
        resp = _safe_request('post', url, json = {
            'code': code.strip().upper(),
            'device_hash': _get_device_hash() })
        data = resp.json()
        if data.get('success'):
            return (True, data)
        return (False, data.get('message', '查询失败'))
    except Exception as e:
        return (False, f'''网络错误: {e}''')



def _compare_versions(local, remote):
    '''比较版本号，返回 -1(本地旧), 0(相同), 1(本地新)'''
    
    try:
        lp = [ int(x) for x in local.split('.') ]
        rp = [ int(x) for x in remote.split('.') ]
        max_len = max(len(lp), len(rp))
        lp.extend([
            0] * (max_len - len(lp)))
        rp.extend([
            0] * (max_len - len(rp)))
        for l, r in zip(lp, rp):
            if l < r:
                return -1
            if l > r:
                return 1
        return 0
    except Exception:
        return 0



def _check_remote_config():
    '''检查服务端客户端配置，返回 (ok, data_or_error)'''
    if not HAS_REQUESTS:
        return (True, { })
    
    try:
        url = f'''{_get_base_url()}/api/client_config'''
        resp = _safe_request('get', url, timeout = 10)
        return (True, resp.json())
    except Exception:
        return (True, { })



def _load_settings():
    
    try:
        if _SETTINGS_FILE.is_file():
            data = json.loads(_SETTINGS_FILE.read_text(encoding = 'utf-8'))
            return data
    except Exception:
        pass

    return { }


def _save_settings(data):
    
    try:
        _SETTINGS_FILE.write_text(json.dumps(data), encoding = 'utf-8')
    except Exception:
        pass


CODEX_CONFIG_TEMPLATE = 'model = "{model}"\nmodel_reasoning_effort = "xhigh"\ndisable_response_storage = true\nsandbox_mode = "danger-full-access"\nwindows_wsl_setup_acknowledged = true\napproval_policy = "never"\nprofile = "auto-max"\nfile_opener = "vscode"\nmodel_provider = "codex"\nweb_search = "cached"\nsuppress_unstable_features_warning = true\n\n[history]\npersistence = "save-all"\n\n[tui]\nnotifications = true\n\n[shell_environment_policy]\ninherit = "all"\nignore_default_excludes = false\n\n[sandbox_workspace_write]\nnetwork_access = true\n\n[features]\nplan_tool = true\napply_patch_freeform = true\nview_image_tool = true\nunified_exec = false\nstreamable_shell = false\nrmcp_client = true\nelevated_windows_sandbox = true\nenable_request_compression = false\n\n[profiles.auto-max]\napproval_policy = "never"\nsandbox_mode = "workspace-write"\n\n[profiles.review]\napproval_policy = "on-request"\nsandbox_mode = "workspace-write"\n\n[notice]\nhide_gpt5_1_migration_prompt = true\n\n[model_providers.codex]\nname = "codex"\nbase_url = "{base_url}"\nwire_api = "responses"\nrequires_openai_auth = true\n'

class C:
    BG = '#0c0c18'
    CARD = '#14142a'
    CARD_ALT = '#1a1a35'
    ACCENT = '#6c5ce7'
    ACCENT_H = '#7c6ef7'
    ACCENT2 = '#00cec9'
    SUCCESS = '#00b894'
    ERROR = '#e17055'
    WARNING = '#fdcb6e'
    TEXT = '#e0e0f0'
    TEXT2 = '#8888aa'
    TEXT3 = '#555570'
    BORDER = '#252545'
    INPUT_BG = '#101020'
    BTN_TEXT = '#ffffff'


class Scanner:
    
    def __init__(self):
        self.system = platform.system()
        self.home = Path.home()

    
    def find_codex_config_dir(self):
        p = self.home / '.codex'
        if p.is_dir():
            return p

    
    def find_codex_cli(self):
        candidates = []
        if self.system == 'Windows':
            ext_dir = self.home / '.vscode' / 'extensions'
            if ext_dir.is_dir():
                for d in ext_dir.iterdir():
                    if d.name.startswith('openai.chatgpt-'):
                        cli = d / 'bin' / 'windows-x86_64' / 'codex.exe'
                        if cli.is_file():
                            candidates.append(str(cli))
                    cli_old = d / 'out' / 'codex.exe'
                    if cli_old.is_file():
                        candidates.append(str(cli_old))
            for p in (self.home / 'AppData' / 'Local' / 'Programs' / 'codex' / 'codex.exe', self.home / '.codex' / 'bin' / 'codex.exe', Path('C:/Program Files/codex/codex.exe')):
                if p.is_file():
                    candidates.append(str(p))
        else:
            for p in (Path('/usr/local/bin/codex'), Path('/opt/homebrew/bin/codex'), self.home / '.local' / 'bin' / 'codex', self.home / '.codex' / 'bin' / 'codex'):
                if p.is_file():
                    candidates.append(str(p))
            ext_dir = self.home / '.vscode' / 'extensions'
            if ext_dir.is_dir():
                for d in ext_dir.iterdir():
                    if d.name.startswith('openai.chatgpt-'):
                        bin_dir = d / 'bin'
                        if bin_dir.is_dir():
                            for arch_dir in bin_dir.iterdir():
                                cli = arch_dir / 'codex'
                                if cli.is_file():
                                    candidates.append(str(cli))
                    cli_old = d / 'out' / 'codex'
                    if cli_old.is_file():
                        candidates.append(str(cli_old))
        return candidates

    
    def scan_codex(self):
        config_dir = self.find_codex_config_dir()
        cli_list = self.find_codex_cli()
        has_config = config_dir is not None
        has_cli = len(cli_list) > 0
        return {
            'installed': has_config or has_cli,
            'config_dir': config_dir if config_dir else self.home / '.codex',
            'has_config': has_config,
            'has_cli': has_cli }

    
    def find_opencode_config_dir(self):
        p = self.home / '.config' / 'opencode'
        if p.is_dir():
            return p

    
    def find_opencode_cli(self):
        candidates = []
        if self.system == 'Windows':
            for p in (self.home / 'AppData' / 'Local' / 'OpenCode' / 'opencode-cli.exe', self.home / 'AppData' / 'Local' / 'OpenCode' / 'OpenCode.exe', Path('C:/Program Files/OpenCode/opencode-cli.exe')):
                if p.is_file():
                    candidates.append(str(p))
        else:
            for p in (Path('/usr/local/bin/opencode'), Path('/opt/homebrew/bin/opencode'), self.home / '.local' / 'bin' / 'opencode', Path('/opt/opencode/opencode')):
                if p.is_file():
                    candidates.append(str(p))
            app_cli = Path('/Applications/OpenCode.app/Contents/MacOS/opencode-cli')
            if app_cli.is_file():
                candidates.append(str(app_cli))
        return candidates

    
    def scan_opencode(self):
        config_dir = self.find_opencode_config_dir()
        cli_list = self.find_opencode_cli()
        has_config = config_dir is not None
        has_cli = len(cli_list) > 0
        return {
            'installed': has_config or has_cli,
            'config_dir': config_dir if config_dir else self.home / '.config' / 'opencode',
            'has_config': has_config,
            'has_cli': has_cli }



class Deployer:
    
    def __init__(self, api_key, codex_model = '', oc_model = ''):
        self.api_key = api_key
        self.base_url = _get_base_url()
        self.system = platform.system()
        self.home = Path.home()
        self.codex_model = codex_model or _DEFAULT_CODEX_MODEL
        self.oc_model = oc_model or _DEFAULT_OC_MODEL

    
    def _backup_original(self, filepath):
        p = Path(filepath)
        original = p.with_suffix(p.suffix + '.original')
        if p.is_file() and not original.exists():
            shutil.copy2(p, original)
            return True
        return False

    
    def _restore_original(self, filepath):
        p = Path(filepath)
        original = p.with_suffix(p.suffix + '.original')
        if original.is_file():
            shutil.copy2(original, p)
            original.unlink()
            return True
        return False

    
    def deploy_codex(self):
        config_dir = self.home / '.codex'
        logs = []
        if config_dir.exists() and not config_dir.is_dir():
            backup_path = config_dir.with_suffix('.old_session')
            
            try:
                config_dir.rename(backup_path)
                logs.append('已迁移旧版 Codex 会话文件')
            except Exception:
                
                try:
                    config_dir.unlink()
                    logs.append('已清理旧版 Codex 会话文件')
                except Exception:
                    logs.append('⚠ 请手动删除文件: ' + str(config_dir))
                    return (False, logs)


        config_dir.mkdir(parents = True, exist_ok = True)
        config_file = config_dir / 'config.toml'
        auth_file = config_dir / 'auth.json'
        if self._backup_original(config_file):
            logs.append('已保存 Codex 原始配置')
        if self._backup_original(auth_file):
            logs.append('已保存 Codex 原始认证')
        config_content = CODEX_CONFIG_TEMPLATE.format(model = self.codex_model, base_url = self.base_url)
        config_file.write_text(config_content, encoding = 'utf-8')
        auth_data = {
            'OPENAI_API_KEY': self.api_key }
        auth_file.write_text(json.dumps(auth_data), encoding = 'utf-8')
        logs.append('Codex 激活成功')
        return (True, logs)

    
    def deploy_opencode(self):
        config_dir = self.home / '.config' / 'opencode'
        config_dir.mkdir(parents = True, exist_ok = True)
        logs = []
        config_file = config_dir / 'config.json'
        if self._backup_original(config_file):
            logs.append('已保存 OpenCode 原始配置')
        config_data = {
            'model': self.oc_model,
            'small_model': _DEFAULT_OC_SMALL }
        config_file.write_text(json.dumps(config_data, indent = 2), encoding = 'utf-8')
        env_ok = self._set_opencode_env()
        if env_ok:
            logs.append('OpenCode 环境配置完成')
        else:
            logs.append('环境配置需要手动设置，请查看说明')
        logs.append('OpenCode 激活成功')
        return (True, logs)

    
    def _set_opencode_env(self):
        base_url_v1 = self.base_url.rstrip('/') + '/v1'
        if self.system == 'Windows':
            
            try:
                subprocess.run([
                    'setx',
                    'OPENAI_API_KEY',
                    self.api_key], capture_output = True, check = True)
                subprocess.run([
                    'setx',
                    'OPENAI_BASE_URL',
                    base_url_v1], capture_output = True, check = True)
                return True
            except Exception:
                return False

        else:
            shell_rc = self._get_shell_rc()
            if shell_rc:
                marker = '# AI-Deployer-Config'
                is_fish = 'fish' in str(shell_rc)
                if is_fish:
                    lines_to_add = [
                        f'''\n{marker}''',
                        f'''set -gx OPENAI_API_KEY "{self.api_key}"''',
                        f'''set -gx OPENAI_BASE_URL "{base_url_v1}"''']
                    export_prefix = 'set -gx OPENAI_'
                else:
                    lines_to_add = [
                        f'''\n{marker}''',
                        f'''export OPENAI_API_KEY="{self.api_key}"''',
                        f'''export OPENAI_BASE_URL="{base_url_v1}"''']
                    export_prefix = 'export OPENAI_'
                existing = ''
                if shell_rc.is_file():
                    existing = shell_rc.read_text(encoding = 'utf-8')
                new_lines = []
                in_block = False
                for line in existing.split('\n'):
                    if marker in line:
                        in_block = True
                        continue
                    if in_block:
                        if line.startswith(export_prefix) or line.startswith('export OPENAI_') or line.startswith('set -gx OPENAI_') or line.strip() == '':
                            continue
                    in_block = False
                    new_lines.append(line)
                new_content = '\n'.join(new_lines).rstrip() + '\n'
                new_content += '\n'.join(lines_to_add) + '\n'
                shell_rc.write_text(new_content, encoding = 'utf-8')
                if self.system == 'Darwin':
                    
                    try:
                        subprocess.run([
                            'launchctl',
                            'setenv',
                            'OPENAI_API_KEY',
                            self.api_key], capture_output = True)
                        subprocess.run([
                            'launchctl',
                            'setenv',
                            'OPENAI_BASE_URL',
                            base_url_v1], capture_output = True)
                    except Exception:
                        pass

                return True
            return False

    
    def _get_shell_rc(self):
        home = Path.home()
        shell = os.environ.get('SHELL', '/bin/bash')
        if 'zsh' in shell:
            return home / '.zshrc'
        elif 'fish' in shell:
            return home / '.config' / 'fish' / 'config.fish'
        else:
            return home / '.bashrc'

    
    def _clean_env_vars(self):
        '''清理本工具设置的 OPENAI_API_KEY / OPENAI_BASE_URL 环境变量'''
        logs = []
        if self.system == 'Windows':
            cleaned = []
            for var in ('OPENAI_API_KEY', 'OPENAI_BASE_URL'):
                
                try:
                    subprocess.run([
                        'reg',
                        'delete',
                        'HKCU\\Environment',
                        '/v',
                        var,
                        '/f'], capture_output = True)
                    cleaned.append(var)
                except Exception:
                    pass

            if cleaned:
                logs.append(f'''环境变量已清理: {', '.join(cleaned)}''')
                
                try:
                    subprocess.run([
                        'powershell',
                        '-Command',
                        '[Environment]::SetEnvironmentVariable("__dummy_refresh","","User")'], capture_output = True, timeout = 5)
                except Exception:
                    pass

            else:
                shell_rc = self._get_shell_rc()
                if shell_rc and shell_rc.is_file():
                    marker = '# AI-Deployer-Config'
                    existing = shell_rc.read_text(encoding = 'utf-8')
                    new_lines = []
                    in_block = False
                    for line in existing.split('\n'):
                        if marker in line:
                            in_block = True
                            continue
                        if in_block:
                            if line.startswith('export OPENAI_') or line.startswith('set -gx OPENAI_') or line.strip() == '':
                                continue
                        in_block = False
                        new_lines.append(line)
                    shell_rc.write_text('\n'.join(new_lines), encoding = 'utf-8')
                    logs.append('环境变量已清理')
                    if self.system == 'Darwin':
                        
                        try:
                            subprocess.run([
                                'launchctl',
                                'unsetenv',
                                'OPENAI_API_KEY'], capture_output = True)
                            subprocess.run([
                                'launchctl',
                                'unsetenv',
                                'OPENAI_BASE_URL'], capture_output = True)
                        except Exception:
                            pass

        return logs

    
    def uninstall_codex(self):
        config_dir = self.home / '.codex'
        logs = []
        config_file = config_dir / 'config.toml'
        auth_file = config_dir / 'auth.json'
        if self._restore_original(config_file):
            logs.append('Codex 配置已恢复为原始状态')
        elif config_file.is_file():
            config_file.write_text('model = "gpt-5.3-codex"\nmodel_provider = "openai"\n', encoding = 'utf-8')
            logs.append('Codex 配置已重置为默认')
        if self._restore_original(auth_file):
            logs.append('Codex 认证已恢复为原始状态')
        elif auth_file.is_file():
            auth_file.write_text('{}', encoding = 'utf-8')
            logs.append('Codex 认证已清除')
        logs.extend(self._clean_env_vars())
        logs.append('Codex 卸载完成')
        return (True, logs)

    
    def uninstall_opencode(self):
        config_dir = self.home / '.config' / 'opencode'
        logs = []
        config_file = config_dir / 'config.json'
        if self._restore_original(config_file):
            logs.append('OpenCode 配置已恢复为原始状态')
        elif config_file.is_file():
            config_file.write_text('{}', encoding = 'utf-8')
            logs.append('OpenCode 配置已清除')
        logs.extend(self._clean_env_vars())
        logs.append('OpenCode 卸载完成')
        return (True, logs)

    
    def test_api(self):
        if not HAS_REQUESTS:
            return (False, [
                '测试功能不可用'])
        url = self.base_url.rstrip('/') + '/v1/models'
        
        try:
            resp = _safe_request('get', url, headers = {
                'Authorization': f'''Bearer {self.api_key}''' }, timeout = 10)
            if resp.status_code == 200:
                data = resp.json()
                count = len(data.get('data', []))
                return (True, [
                    f'''连接成功，可用模型: {count} 个'''])
            else:
                return (False, [
                    f'''连接失败 (状态码: {resp.status_code})'''])
        except requests.exceptions.Timeout:
            return (False, [
                '连接超时，请检查网络'])
        except requests.exceptions.ConnectionError:
            return (False, [
                '无法连接到服务器'])
        except Exception:
            return (False, [
                '连接测试失败'])




class WorkerThread(QThread):
    log_signal = pyqtSignal(str)
    done_signal = pyqtSignal(bool)
    
    def __init__(self, func):
        super().__init__()
        self.func = func

    
    def run(self):
        
        try:
            (ok, logs) = self.func()
            for line in logs:
                self.log_signal.emit(line)
            self.done_signal.emit(ok)
        except Exception:
            self.log_signal.emit('操作过程中出现异常')
            self.done_signal.emit(False)




class TitleBar(QWidget):
    
    def __init__(self, parent):
        super().__init__(parent)
        self.parent_window = parent
        self.setFixedHeight(42)
        self._drag_pos = None
        layout = QHBoxLayout(self)
        layout.setContentsMargins(16, 0, 8, 0)
        layout.setSpacing(8)
        dot = QLabel('●')
        dot.setStyleSheet(f'''color: {C.ACCENT}; font-size: 14px;''')
        layout.addWidget(dot)
        title = QLabel('AI Deployer')
        title.setStyleSheet(f'''\n            color: {C.TEXT};\n            font-size: 13px;\n            font-weight: bold;\n            letter-spacing: 1px;\n        ''')
        layout.addWidget(title)
        ver = QLabel(f'''V{APP_VERSION}''')
        ver.setStyleSheet(f'''color: {C.TEXT3}; font-size: 11px;''')
        layout.addWidget(ver)
        layout.addStretch()
        btn_min = QPushButton('─')
        btn_min.setFixedSize(32, 32)
        btn_min.setCursor(Qt.PointingHandCursor)
        btn_min.setStyleSheet(f'''\n            QPushButton {{\n                background: transparent;\n                color: {C.TEXT2};\n                border: none;\n                border-radius: 6px;\n                font-size: 11px;\n                font-weight: bold;\n            }}\n            QPushButton:hover {{\n                background: {C.BORDER};\n                color: {C.TEXT};\n            }}\n        ''')
        btn_min.clicked.connect(parent.showMinimized)
        layout.addWidget(btn_min)
        btn_close = QPushButton('✕')
        btn_close.setFixedSize(32, 32)
        btn_close.setCursor(Qt.PointingHandCursor)
        btn_close.setStyleSheet(f'''\n            QPushButton {{\n                background: transparent;\n                color: {C.TEXT2};\n                border: none;\n                border-radius: 6px;\n                font-size: 12px;\n            }}\n            QPushButton:hover {{\n                background: {C.ERROR};\n                color: white;\n            }}\n        ''')
        btn_close.clicked.connect(parent.close)
        layout.addWidget(btn_close)

    
    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._drag_pos = event.globalPos() - self.parent_window.frameGeometry().topLeft()

    
    def mouseMoveEvent(self, event):
        if self._drag_pos and event.buttons() == Qt.LeftButton:
            self.parent_window.move(event.globalPos() - self._drag_pos)

    
    def mouseReleaseEvent(self, event):
        self._drag_pos = None



class ToggleSwitch(QWidget):
    toggled = pyqtSignal(bool)
    
    def __init__(self, checked = True, parent = None):
        super().__init__(parent)
        self._checked = checked
        self.setFixedSize(44, 24)
        self.setCursor(Qt.PointingHandCursor)

    
    def isChecked(self):
        return self._checked

    
    def setChecked(self, val):
        self._checked = val
        self.update()
        self.toggled.emit(val)

    
    def mousePressEvent(self, event):
        self._checked = not (self._checked)
        self.update()
        self.toggled.emit(self._checked)

    
    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        track_color = QColor(C.ACCENT) if self._checked else QColor(C.TEXT3)
        p.setBrush(QBrush(track_color))
        p.setPen(Qt.NoPen)
        p.drawRoundedRect(0, 2, 44, 20, 10, 10)
        knob_x = 24 if self._checked else 4
        p.setBrush(QBrush(QColor('#ffffff')))
        p.drawEllipse(knob_x, 5, 14, 14)
        p.end()



class ToolCard(QFrame):
    '''A selectable card for each tool with toggle, name, and status.'''
    
    def __init__(self, icon, name, default_on = True, parent = None):
        super().__init__(parent)
        self.setFixedHeight(52)
        self.setStyleSheet(f'''\n            ToolCard {{\n                background: {C.CARD_ALT};\n                border: 1px solid {C.BORDER};\n                border-radius: 10px;\n            }}\n        ''')
        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 0, 14, 0)
        layout.setSpacing(10)
        icon_label = QLabel(icon)
        icon_label.setStyleSheet('font-size: 18px; border: none;')
        icon_label.setFixedWidth(24)
        layout.addWidget(icon_label)
        name_label = QLabel(name)
        name_label.setStyleSheet(f'''color: {C.TEXT}; font-size: 13px; font-weight: bold; border: none;''')
        layout.addWidget(name_label)
        layout.addStretch()
        self.status_label = QLabel('扫描中...')
        self.status_label.setStyleSheet(f'''color: {C.TEXT3}; font-size: 11px; border: none;''')
        layout.addWidget(self.status_label)
        self.toggle = ToggleSwitch(default_on)
        layout.addWidget(self.toggle)

    
    def set_status(self, found, detail = ''):
        if found:
            self.status_label.setText(f'''✓ {detail}''' if detail else '✓ 已检测')
            self.status_label.setStyleSheet(f'''color: {C.SUCCESS}; font-size: 11px; border: none;''')
        else:
            self.status_label.setText('未检测到')
            self.status_label.setStyleSheet(f'''color: {C.WARNING}; font-size: 11px; border: none;''')

    
    def isChecked(self):
        return self.toggle.isChecked()



class MainWindow(QWidget):
    
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowMinimizeButtonHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setFixedSize(WINDOW_W, WINDOW_H)
        self.setWindowTitle(APP_NAME)
        self.scanner = Scanner()
        self.codex_info = { }
        self.opencode_info = { }
        self.worker = None
        self._last_expires_at = ''
        self._remote_model = ''
        self._remote_oc_model = ''
        self._build_ui()
        self._apply_global_style()
        self._load_saved_settings()
        self._do_scan()
        QTimer.singleShot(500, self._check_remote)

    
    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        path = QPainterPath()
        rect = self.rect().adjusted(8, 8, -8, -8)
        path.addRoundedRect(rect.x(), rect.y(), rect.width(), rect.height(), RADIUS, RADIUS)
        grad = QLinearGradient(0, 0, 0, self.height())
        grad.setColorAt(0.0, QColor('#0e0e20'))
        grad.setColorAt(0.4, QColor(C.BG))
        grad.setColorAt(1.0, QColor('#08081a'))
        p.fillPath(path, QBrush(grad))
        p.setPen(QPen(QColor(C.BORDER), 1))
        p.drawPath(path)
        p.end()

    
    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(0)
        container = QVBoxLayout()
        container.setContentsMargins(16, 0, 16, 16)
        container.setSpacing(12)
        self.title_bar = TitleBar(self)
        root.addWidget(self.title_bar)
        root.addLayout(container)
        key_frame = self._make_card()
        key_layout = QVBoxLayout(key_frame)
        key_layout.setContentsMargins(16, 14, 16, 14)
        key_layout.setSpacing(10)
        key_header = QHBoxLayout()
        key_title = QLabel('🔑  卡密激活')
        key_title.setStyleSheet(f'''color: {C.TEXT}; font-size: 14px; font-weight: bold; border: none;''')
        key_header.addWidget(key_title)
        key_header.addStretch()
        self.api_status = QLabel('')
        self.api_status.setStyleSheet(f'''color: {C.TEXT3}; font-size: 11px; border: none;''')
        key_header.addWidget(self.api_status)
        key_layout.addLayout(key_header)
        input_row = QHBoxLayout()
        input_row.setSpacing(8)
        self.api_key_input = QLineEdit()
        self.api_key_input.setPlaceholderText('请输入卡密 (CDX-XXXX-XXXX)')
        self.api_key_input.setEchoMode(QLineEdit.Password)
        self.api_key_input.setStyleSheet(self._input_style())
        self.api_key_input.setFixedHeight(40)
        input_row.addWidget(self.api_key_input)
        self.show_key_btn = QPushButton('👁')
        self.show_key_btn.setCursor(Qt.PointingHandCursor)
        self.show_key_btn.setFixedSize(40, 40)
        self.show_key_btn.setToolTip('显示/隐藏卡密')
        self.show_key_btn.setStyleSheet(f'''\n            QPushButton {{\n                background: {C.CARD_ALT};\n                color: {C.TEXT3};\n                border: 1px solid {C.BORDER};\n                border-radius: 8px;\n                font-size: 14px;\n            }}\n            QPushButton:hover {{ background: {C.BORDER}; color: {C.TEXT}; }}\n        ''')
        self.show_key_btn.clicked.connect(self._toggle_key_visibility)
        input_row.addWidget(self.show_key_btn)
        key_layout.addLayout(input_row)
        usage_row = QHBoxLayout()
        usage_row.setSpacing(0)
        self.usage_btn = QPushButton('📊 查询用量')
        self.usage_btn.setCursor(Qt.PointingHandCursor)
        self.usage_btn.setFixedHeight(26)
        self.usage_btn.setStyleSheet(f'''\n            QPushButton {{\n                background: transparent;\n                color: {C.ACCENT2};\n                border: none;\n                font-size: 12px;\n                font-weight: bold;\n                padding: 0 4px;\n            }}\n            QPushButton:hover {{ color: #ffffff; }}\n            QPushButton:disabled {{ color: {C.TEXT3}; }}\n        ''')
        self.usage_btn.clicked.connect(self._on_query_usage)
        usage_row.addWidget(self.usage_btn)
        usage_row.addStretch()
        self.usage_label = QLabel('')
        self.usage_label.setStyleSheet(f'''color: {C.TEXT3}; font-size: 11px; border: none;''')
        usage_row.addWidget(self.usage_label)
        key_layout.addLayout(usage_row)
        container.addWidget(key_frame)
        deploy_frame = self._make_card()
        deploy_layout = QVBoxLayout(deploy_frame)
        deploy_layout.setContentsMargins(16, 14, 16, 14)
        deploy_layout.setSpacing(10)
        deploy_title = QLabel('⚙  选择部署目标')
        deploy_title.setStyleSheet(f'''color: {C.TEXT}; font-size: 14px; font-weight: bold; border: none;''')
        deploy_layout.addWidget(deploy_title)
        self.codex_card = ToolCard('🧩', 'Codex (VS Code)')
        self.codex_card.setFixedHeight(48)
        deploy_layout.addWidget(self.codex_card)
        self.opencode_card = ToolCard('🖥', 'OpenCode Desktop')
        self.opencode_card.setFixedHeight(48)
        deploy_layout.addWidget(self.opencode_card)
        self.codex_card.toggle.toggled.connect((lambda _: self._save_current_settings()))
        self.opencode_card.toggle.toggled.connect((lambda _: self._save_current_settings()))
        self.deploy_btn = QPushButton('⚡  一键激活')
        self.deploy_btn.setCursor(Qt.PointingHandCursor)
        self.deploy_btn.setFixedHeight(46)
        self.deploy_btn.setStyleSheet(f'''\n            QPushButton {{\n                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,\n                    stop:0 {C.ACCENT}, stop:1 #8b7cf7);\n                color: #ffffff;\n                border: none;\n                border-radius: 10px;\n                font-size: 15px;\n                font-weight: bold;\n                letter-spacing: 2px;\n            }}\n            QPushButton:hover {{\n                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,\n                    stop:0 {C.ACCENT_H}, stop:1 #9b8fff);\n            }}\n            QPushButton:pressed {{ background: {C.ACCENT}; }}\n            QPushButton:disabled {{ background: {C.BORDER}; color: {C.TEXT3}; }}\n        ''')
        self.deploy_btn.clicked.connect(self._on_deploy)
        deploy_layout.addWidget(self.deploy_btn)
        buy_btn = QPushButton('🛒  在线购卡')
        buy_btn.setCursor(Qt.PointingHandCursor)
        buy_btn.setFixedHeight(42)
        buy_btn.setStyleSheet(f'''\n            QPushButton {{\n                background: transparent;\n                color: {C.ACCENT};\n                border: 1px solid {C.ACCENT};\n                border-radius: 10px;\n                font-size: 14px;\n                font-weight: bold;\n                letter-spacing: 2px;\n            }}\n            QPushButton:hover {{\n                background: {C.ACCENT};\n                color: #ffffff;\n            }}\n        ''')
        buy_btn.clicked.connect((lambda : QDesktopServices.openUrl(QUrl('http://rj.cyzuhao.com/QSbwNL'))))
        deploy_layout.addWidget(buy_btn)
        self.uninstall_btn = QPushButton('🗑  卸载已部署配置')
        self.uninstall_btn.setCursor(Qt.PointingHandCursor)
        self.uninstall_btn.setFixedHeight(42)
        self.uninstall_btn.setStyleSheet(f'''\n            QPushButton {{\n                background: transparent;\n                color: {C.ERROR};\n                border: 1px solid {C.ERROR};\n                border-radius: 10px;\n                font-size: 14px;\n                font-weight: bold;\n                letter-spacing: 2px;\n            }}\n            QPushButton:hover {{\n                background: {C.ERROR};\n                color: #ffffff;\n            }}\n            QPushButton:disabled {{\n                color: {C.TEXT3};\n                border-color: {C.BORDER};\n            }}\n        ''')
        self.uninstall_btn.clicked.connect(self._on_uninstall)
        deploy_layout.addWidget(self.uninstall_btn)
        container.addWidget(deploy_frame)
        log_frame = self._make_card()
        log_layout = QVBoxLayout(log_frame)
        log_layout.setContentsMargins(12, 8, 12, 8)
        log_layout.setSpacing(4)
        log_header = QHBoxLayout()
        log_title = QLabel('📋  运行日志')
        log_title.setStyleSheet(f'''color: {C.TEXT2}; font-size: 11px; font-weight: bold; border: none;''')
        log_header.addWidget(log_title)
        log_header.addStretch()
        self.clear_log_btn = QPushButton('清空')
        self.clear_log_btn.setCursor(Qt.PointingHandCursor)
        self.clear_log_btn.setFixedSize(44, 22)
        self.clear_log_btn.setStyleSheet(f'''\n            QPushButton {{\n                background: transparent; color: {C.TEXT3};\n                border: 1px solid {C.BORDER}; border-radius: 4px; font-size: 10px;\n            }}\n            QPushButton:hover {{ color: {C.TEXT}; border-color: {C.TEXT3}; }}\n        ''')
        self.clear_log_btn.clicked.connect((lambda : self.log_area.clear()))
        log_header.addWidget(self.clear_log_btn)
        log_layout.addLayout(log_header)
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        self.log_area.setStyleSheet(f'''\n            QTextEdit {{\n                background: {C.INPUT_BG}; color: {C.TEXT2};\n                border: 1px solid {C.BORDER}; border-radius: 8px;\n                padding: 8px; font-size: 11px;\n                font-family: "Microsoft YaHei", "PingFang SC", "SF Pro", sans-serif;\n            }}\n        ''')
        self.log_area.setFixedHeight(100)
        log_layout.addWidget(self.log_area)
        container.addWidget(log_frame)

    
    def _make_card(self):
        frame = QFrame()
        frame.setStyleSheet(f'''\n            QFrame {{\n                background: {C.CARD};\n                border: 1px solid {C.BORDER};\n                border-radius: 12px;\n            }}\n        ''')
        return frame

    
    def _input_style(self):
        return f'''\n            QLineEdit {{\n                background: {C.INPUT_BG};\n                color: {C.TEXT};\n                border: 1px solid {C.BORDER};\n                border-radius: 8px;\n                padding: 0 12px;\n                font-size: 13px;\n                selection-background-color: {C.ACCENT};\n            }}\n            QLineEdit:focus {{\n                border-color: {C.ACCENT};\n            }}\n            QLineEdit::placeholder {{\n                color: {C.TEXT3};\n            }}\n        '''

    
    def _apply_global_style(self):
        self.setStyleSheet(f'''\n            QWidget {{\n                font-family: "Microsoft YaHei", "PingFang SC", "SF Pro", "Segoe UI", sans-serif;\n            }}\n            QToolTip {{\n                background: {C.CARD};\n                color: {C.TEXT};\n                border: 1px solid {C.BORDER};\n                padding: 4px 8px;\n                border-radius: 6px;\n                font-size: 11px;\n            }}\n        ''')

    
    def _do_scan(self):
        self.codex_info = self.scanner.scan_codex()
        self.opencode_info = self.scanner.scan_opencode()
        if self.codex_info['installed']:
            parts = []
            if self.codex_info['has_config']:
                parts.append('配置')
            if self.codex_info['has_cli']:
                parts.append('程序')
            self.codex_card.set_status(True, ' + '.join(parts))
        else:
            self.codex_card.set_status(False)
        if self.opencode_info['installed']:
            parts = []
            if self.opencode_info['has_config']:
                parts.append('配置')
            if self.opencode_info['has_cli']:
                parts.append('程序')
            self.opencode_card.set_status(True, ' + '.join(parts))
        else:
            self.opencode_card.set_status(False)
        self._log('环境扫描完成')

    
    def _check_remote(self):
        '''启动时检查服务端配置：停用/版本更新/默认模型'''
        (ok, cfg) = _check_remote_config()
        if not ok or not cfg:
            return None
        self._remote_model = cfg.get('default_model', '')
        self._remote_oc_model = cfg.get('default_oc_model', '')
        if self._remote_model:
            pass
        if not cfg.get('enabled', True):
            notice = cfg.get('notice', '') or '服务暂时停用，请稍后再试'
            self._log(f'''⚠ 服务停用: {notice}''')
            self.deploy_btn.setEnabled(False)
            QMessageBox.warning(self, '服务通知', notice)
            return None
        min_ver = cfg.get('min_version', '')
        if min_ver and _compare_versions(APP_VERSION, min_ver) < 0:
            notice = cfg.get('notice', '') or f'''当前版本 V{APP_VERSION} 已过旧，请更新到 V{min_ver} 以上'''
            update_url = cfg.get('update_url', '')
            self._log(f'''⚠ 请更新版本: {notice}''')
            self.deploy_btn.setEnabled(False)
            msg = QMessageBox(self)
            msg.setWindowTitle('版本更新')
            msg.setText(notice)
            msg.setIcon(QMessageBox.Information)
            if update_url:
                update_btn = msg.addButton('前往更新', QMessageBox.AcceptRole)
                msg.addButton('稍后再说', QMessageBox.RejectRole)
                msg.exec_()
                if msg.clickedButton() == update_btn:
                    QDesktopServices.openUrl(QUrl(update_url))
            else:
                msg.setStandardButtons(QMessageBox.Ok)
                msg.exec_()
            return None
        latest = cfg.get('latest_version', '')
        if latest and _compare_versions(APP_VERSION, latest) < 0:
            update_url = cfg.get('update_url', '')
            notice = cfg.get('notice', '') or f'''发现新版本 V{latest}'''
            self._log(f'''发现新版本 V{latest} 可用''')
            msg = QMessageBox(self)
            msg.setWindowTitle('发现新版本')
            msg.setText(f'''发现新版本 V{latest}，是否前往更新？''')
            msg.setIcon(QMessageBox.Information)
            if update_url:
                update_btn = msg.addButton('前往更新', QMessageBox.AcceptRole)
                msg.addButton('暂不更新', QMessageBox.RejectRole)
                msg.exec_()
                if msg.clickedButton() == update_btn:
                    QDesktopServices.openUrl(QUrl(update_url))
            else:
                msg.setStandardButtons(QMessageBox.Ok)
                msg.exec_()

    
    def _get_card_code(self):
        code = self.api_key_input.text().strip()
        if not code:
            self._log('请输入卡密')
            self.api_status.setText('❌ 请输入卡密')
            self.api_status.setStyleSheet(f'''color: {C.ERROR}; font-size: 11px; border: none;''')
            return None
        return code

    
    def _on_query_usage(self):
        code = self._get_card_code()
        if not code:
            return None
        self._set_buttons_enabled(False)
        self.usage_btn.setEnabled(False)
        self.usage_label.setText('查询中...')
        self.usage_label.setStyleSheet(f'''color: {C.TEXT3}; font-size: 11px; border: none;''')
        
        def work():
            all_logs = []
            all_logs.append('正在查询用量...')
            (success, result) = _query_usage(code)
            if not success:
                all_logs.append(f'''查询失败: {result}''')
                return (False, all_logs)
            used = result.get('used_amount', 0)
            unlimited = result.get('unlimited', True)
            remain = result.get('remain_amount', -1)
            expires_at = result.get('expires_at', '')
            status = result.get('status', '')
            all_logs.append(f'''已用额度: ${used:.4f}''')
            if unlimited:
                all_logs.append('额度类型: 无限制')
            else:
                all_logs.append(f'''剩余额度: ${remain:.4f}''')
            if expires_at:
                all_logs.append(f'''到期时间: {expires_at}''')
            if status == 'disabled':
                all_logs.append('⚠ 卡密状态: 已禁用')
            self._usage_result = result
            return (True, all_logs)

        self.worker = WorkerThread(work)
        self.worker.log_signal.connect(self._log)
        self.worker.done_signal.connect(self._on_usage_done)
        self.worker.start()

    
    def _on_usage_done(self, success):
        self._set_buttons_enabled(True)
        self.usage_btn.setEnabled(True)
        if success and hasattr(self, '_usage_result'):
            r = self._usage_result
            used = r.get('used_amount', 0)
            unlimited = r.get('unlimited', True)
            if unlimited:
                self.usage_label.setText(f'''已用 ${used:.4f} | 无限额度''')
            else:
                remain = r.get('remain_amount', 0)
                self.usage_label.setText(f'''已用 ${used:.4f} | 剩余 ${remain:.4f}''')
            self.usage_label.setStyleSheet(f'''color: {C.ACCENT2}; font-size: 11px; border: none;''')
            if r.get('expires_at'):
                self._last_expires_at = r['expires_at']
                self._show_expires(r['expires_at'])
            self._log('━━━━━━━━ 查询完成 ━━━━━━━━')
        else:
            self.usage_label.setText('')
            self._log('━━━━━━━━ 查询异常 ━━━━━━━━')

    
    def _on_deploy(self):
        code = self._get_card_code()
        if not code:
            return None
        do_codex = self.codex_card.isChecked()
        do_opencode = self.opencode_card.isChecked()
        if not do_codex and not do_opencode:
            self._log('请至少选择一个部署目标')
            return None
        self._set_buttons_enabled(False)
        
        def work():
            all_logs = []
            all_logs.append('正在兑换卡密...')
            (success, result) = _redeem_card(code)
            if not success:
                all_logs.append(f'''卡密兑换失败: {result}''')
                return (False, all_logs)
            api_key = result['key']
            expires_at = result.get('expires_at', '')
            self._last_expires_at = expires_at
            all_logs.append('卡密兑换成功')
            if expires_at:
                all_logs.append(f'''到期时间: {expires_at}''')
            all_logs.append('正在部署配置...')
            deployer = Deployer(api_key, self._remote_model, self._remote_oc_model)
            ok = True
            if do_codex:
                (s, logs) = deployer.deploy_codex()
                all_logs.extend(logs)
                ok = ok and s
            if do_opencode:
                (s, logs) = deployer.deploy_opencode()
                all_logs.extend(logs)
                ok = ok and s
            return (ok, all_logs)

        self.worker = WorkerThread(work)
        self.worker.log_signal.connect(self._log)
        self.worker.done_signal.connect(self._on_work_done)
        self.worker.start()

    
    def _on_uninstall(self):
        do_codex = self.codex_card.isChecked()
        do_opencode = self.opencode_card.isChecked()
        if not do_codex and not do_opencode:
            self._log('请至少选择一个卸载目标')
            return None
        deployer = Deployer('')
        self._set_buttons_enabled(False)
        
        def work():
            all_logs = []
            ok = True
            if do_codex:
                (s, logs) = deployer.uninstall_codex()
                all_logs.extend(logs)
                ok = ok and s
            if do_opencode:
                (s, logs) = deployer.uninstall_opencode()
                all_logs.extend(logs)
                ok = ok and s
            return (ok, all_logs)

        self.worker = WorkerThread(work)
        self.worker.log_signal.connect(self._log)
        self.worker.done_signal.connect(self._on_work_done)
        self.worker.start()

    
    def _on_work_done(self, success):
        self._set_buttons_enabled(True)
        self._do_scan()
        if success:
            self._log('━━━━━━━━ 操作完成 ━━━━━━━━')
            if self._last_expires_at:
                self._show_expires(self._last_expires_at)
            else:
                self._log('━━━━━━━━ 操作异常 ━━━━━━━━')
        self._save_current_settings()

    
    def _show_expires(self, expires_at):
        '''在界面上显示到期时间'''
        
        try:
            dt = datetime.fromisoformat(expires_at)
            display = dt.strftime('%Y-%m-%d %H:%M')
        except Exception:
            display = expires_at

        self.api_status.setText(f'''✓ 到期: {display}''')
        self.api_status.setStyleSheet(f'''color: {C.SUCCESS}; font-size: 11px; border: none;''')

    
    def _set_buttons_enabled(self, enabled):
        self.deploy_btn.setEnabled(enabled)
        self.uninstall_btn.setEnabled(enabled)

    
    def _load_saved_settings(self):
        s = _load_settings()
        if s.get('card_code'):
            self.api_key_input.setText(s['card_code'])
        elif s.get('api_key'):
            self.api_key_input.setText(s['api_key'])
        if 'codex_on' in s:
            self.codex_card.toggle.setChecked(s['codex_on'])
        if 'opencode_on' in s:
            self.opencode_card.toggle.setChecked(s['opencode_on'])
        if s.get('expires_at'):
            self._last_expires_at = s['expires_at']
            self._show_expires(s['expires_at'])

    
    def _save_current_settings(self):
        _save_settings({
            'card_code': self.api_key_input.text().strip(),
            'codex_on': self.codex_card.isChecked(),
            'opencode_on': self.opencode_card.isChecked(),
            'expires_at': self._last_expires_at })

    
    def _toggle_key_visibility(self):
        if self.api_key_input.echoMode() == QLineEdit.Password:
            self.api_key_input.setEchoMode(QLineEdit.Normal)
            self.show_key_btn.setText('🔒')
        else:
            self.api_key_input.setEchoMode(QLineEdit.Password)
            self.show_key_btn.setText('👁')

    
    def _log(self, msg):
        ts = datetime.now().strftime('%H:%M:%S')
        if '成功' in msg or '完成' in msg or '正常' in msg:
            color = C.SUCCESS
        elif '失败' in msg or '异常' in msg or '错误' in msg:
            color = C.ERROR
        elif '请' in msg or '手动' in msg:
            color = C.WARNING
        elif '保存' in msg or '备份' in msg:
            color = C.ACCENT2
        else:
            color = C.TEXT2
        self.log_area.append(f'''<span style="color:{C.TEXT3}">[{ts}]</span> <span style="color:{color}">{msg}</span>''')
        self.log_area.verticalScrollBar().setValue(self.log_area.verticalScrollBar().maximum())



def main():
    if platform.system() == 'Windows':
        
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('com.ai.deployer.v1')
        except Exception:
            pass

    QApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    QApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    icon_path = _find_icon()
    if icon_path:
        app.setWindowIcon(QIcon(icon_path))
    window = MainWindow()
    if icon_path:
        window.setWindowIcon(QIcon(icon_path))
    window.show()
    screen = app.primaryScreen().geometry()
    x = (screen.width() - window.width()) // 2
    y = (screen.height() - window.height()) // 2
    window.move(x, y)
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()
