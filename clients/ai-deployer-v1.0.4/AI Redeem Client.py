import base64
import hashlib
import json
import platform
import sys
import uuid
from datetime import datetime
from pathlib import Path

from PyQt5.QtCore import Qt
from PyQt5.QtGui import QColor, QFont, QIcon
from PyQt5.QtWidgets import (
    QApplication,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

try:
    import requests
    import urllib3

    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


APP_NAME = "AI Redeem Client"
APP_VERSION = "1.0.0"
WINDOW_W = 520
WINDOW_H = 560
_EP = "aHR0cHM6Ly9hcGkuMTg2OTAwMC54eXo="


class C:
    BG = "#120f22"
    CARD = "#faf8ff"
    CARD_ALT = "#ffffff"
    ACCENT = "#6c5ce7"
    ACCENT_H = "#7c6ef7"
    ACCENT2 = "#00cec9"
    SUCCESS = "#00b894"
    ERROR = "#e17055"
    WARNING = "#fdcb6e"
    TEXT = "#121021"
    TEXT2 = "#1f1a33"
    TEXT3 = "#6f6888"
    BORDER = "#1a1530"
    INPUT_BG = "#ffffff"


def _find_icon():
    candidates = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            candidates.append(Path(meipass))
        candidates.append(Path(sys.executable).parent)
    else:
        candidates.append(Path(__file__).parent)
    for base in candidates:
        for ico in base.glob("*.ico"):
            return str(ico)
    return ""


def _get_base_url():
    return base64.b64decode(_EP).decode()


def _get_device_hash():
    try:
        raw = f"{uuid.getnode()}-{platform.node()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
    except Exception:
        return "unknown"


def _safe_request(method, url, **kwargs):
    kwargs.setdefault("timeout", 15)
    try:
        return getattr(requests, method)(url, **kwargs)
    except (requests.exceptions.SSLError, requests.exceptions.ConnectionError) as e:
        if "ssl" in str(e).lower() or "eof" in str(e).lower():
            kwargs["verify"] = False
            return getattr(requests, method)(url, **kwargs)
        raise


def _format_expires_for_display(expires_at):
    if not expires_at:
        return ""
    try:
        normalized = expires_at.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is not None:
            dt = dt.astimezone()
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return expires_at


def _redeem_card(code):
    if not HAS_REQUESTS:
        return False, "缺少 requests 库"
    try:
        url = f"{_get_base_url()}/api/redeem"
        payload = {
            "code": code.strip().upper(),
            "device_hash": _get_device_hash(),
            "client_version": APP_VERSION,
        }
        resp = _safe_request("post", url, json=payload)
        data = resp.json()
        if data.get("success"):
            return True, {
                "key": data.get("key", ""),
                "expires_at": data.get("expires_at", ""),
            }
        return False, data.get("message", "兑换失败")
    except Exception as e:
        return False, f"网络错误: {e}"


class RedeemWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_NAME)
        self.setFixedSize(WINDOW_W, WINDOW_H)
        self.setObjectName("window")
        self._build_ui()
        self._apply_style()

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(24, 22, 24, 24)
        root.setSpacing(14)

        header = QHBoxLayout()
        title = QLabel("兑换 URL 与 Key")
        title.setStyleSheet(f"color: white; font-size: 24px; font-weight: bold;")
        sub = QLabel(f"v{APP_VERSION}")
        sub.setStyleSheet(f"color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 600;")
        header.addWidget(title)
        header.addWidget(sub)
        header.addStretch()
        root.addLayout(header)

        card = QFrame()
        card.setObjectName("card")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(22, 20, 22, 20)
        card_layout.setSpacing(14)

        code_label = QLabel("卡密")
        code_label.setStyleSheet(f"color: {C.TEXT2}; font-size: 16px; font-weight: bold;")
        card_layout.addWidget(code_label)

        code_row = QHBoxLayout()
        code_row.setSpacing(8)
        self.code_input = QLineEdit()
        self.code_input.setPlaceholderText("请输入卡密（CDX-XXXX-XXXX）")
        self.code_input.setEchoMode(QLineEdit.Password)
        self.code_input.setFixedHeight(52)
        code_row.addWidget(self.code_input, 1)

        self.toggle_btn = QPushButton("👁")
        self.toggle_btn.setFixedSize(52, 52)
        self.toggle_btn.clicked.connect(self._toggle_code)
        code_row.addWidget(self.toggle_btn)
        card_layout.addLayout(code_row)

        self.redeem_btn = QPushButton("立即兑换")
        self.redeem_btn.setFixedHeight(58)
        self.redeem_btn.clicked.connect(self._on_redeem)
        card_layout.addWidget(self.redeem_btn)

        self.status_label = QLabel("")
        self.status_label.setWordWrap(True)
        self.status_label.setStyleSheet(f"color: {C.TEXT3}; font-size: 13px;")
        card_layout.addWidget(self.status_label)

        root.addWidget(card)

        result = QFrame()
        result.setObjectName("card")
        result.setMinimumHeight(220)
        result_layout = QVBoxLayout(result)
        result_layout.setContentsMargins(22, 18, 22, 18)
        result_layout.setSpacing(8)

        result_title = QLabel("兑换结果")
        result_title.setStyleSheet(f"color: {C.TEXT}; font-size: 18px; font-weight: bold;")
        result_layout.addWidget(result_title)

        url_title = QLabel("URL")
        url_title.setStyleSheet(f"color: {C.TEXT2}; font-size: 14px; font-weight: 600;")
        self.url_value = QLineEdit()
        self.url_value.setReadOnly(True)
        self.url_value.setFixedHeight(48)
        self.copy_url_btn = QPushButton("复制")
        self.copy_url_btn.setFixedHeight(44)
        self.copy_url_btn.setMinimumWidth(84)
        self.copy_url_btn.clicked.connect(lambda: self._copy_text(self.url_value.text(), "URL 已复制"))
        result_layout.addWidget(url_title)
        url_row = QHBoxLayout()
        url_row.setSpacing(10)
        url_row.addWidget(self.url_value, 1)
        url_row.addWidget(self.copy_url_btn)
        result_layout.addLayout(url_row)

        key_title = QLabel("Key")
        key_title.setStyleSheet(f"color: {C.TEXT2}; font-size: 14px; font-weight: 600;")
        self.key_value = QLineEdit()
        self.key_value.setReadOnly(True)
        self.key_value.setFixedHeight(48)
        self.copy_key_btn = QPushButton("复制")
        self.copy_key_btn.setFixedHeight(44)
        self.copy_key_btn.setMinimumWidth(84)
        self.copy_key_btn.clicked.connect(lambda: self._copy_text(self.key_value.text(), "Key 已复制"))
        result_layout.addWidget(key_title)
        key_row = QHBoxLayout()
        key_row.setSpacing(10)
        key_row.addWidget(self.key_value, 1)
        key_row.addWidget(self.copy_key_btn)
        result_layout.addLayout(key_row)

        root.addWidget(result, 1)

    def _apply_style(self):
        self.setStyleSheet(
            f"""
            QWidget#window {{
                background: qlineargradient(
                    x1:0, y1:0, x2:0.95, y2:1,
                    stop:0 #130f22,
                    stop:0.55 #24104d,
                    stop:1 #9e79ff
                );
            }}
            QWidget {{
                background: transparent;
                color: {C.TEXT};
                font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
            }}
            QFrame#card {{
                background: {C.CARD};
                border: 2px solid {C.BORDER};
                border-radius: 28px;
            }}
            QLineEdit {{
                background: {C.INPUT_BG};
                color: {C.TEXT};
                border: 2px solid {C.BORDER};
                border-radius: 18px;
                padding: 0 18px;
                font-size: 18px;
            }}
            QLineEdit[readOnly="true"] {{
                background: {C.CARD_ALT};
            }}
            QLineEdit:focus {{
                border-color: {C.ACCENT};
            }}
            QPushButton {{
                background: {C.CARD_ALT};
                color: {C.TEXT2};
                border: 2px solid {C.BORDER};
                border-radius: 18px;
                font-size: 18px;
                font-weight: bold;
                padding: 0 18px;
            }}
            QPushButton:hover {{
                background: #f3ecff;
            }}
            QPushButton:pressed {{
                background: #efe7ff;
            }}
            QPushButton:disabled {{
                color: {C.TEXT3};
                border-color: {C.BORDER};
                background: #f3f0fb;
            }}
            """
        )
        self.redeem_btn.setStyleSheet(
            f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #8f78ff, stop:1 #a78bff);
                color: white;
                border: 2px solid {C.BORDER};
                border-radius: 20px;
                font-size: 22px;
                font-weight: bold;
            }}
            QPushButton:hover {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #9b84ff, stop:1 #b396ff);
            }}
            """
        )

    def _toggle_code(self):
        if self.code_input.echoMode() == QLineEdit.Password:
            self.code_input.setEchoMode(QLineEdit.Normal)
            self.toggle_btn.setText("🔒")
        else:
            self.code_input.setEchoMode(QLineEdit.Password)
            self.toggle_btn.setText("👁")

    def _copy_text(self, text, ok_message):
        if not text:
            QMessageBox.warning(self, "提示", "当前没有可复制的内容")
            return
        QApplication.clipboard().setText(text)
        self.status_label.setText(ok_message)
        self.status_label.setStyleSheet(f"color: {C.SUCCESS}; font-size: 12px;")

    def _on_redeem(self):
        code = self.code_input.text().strip()
        if not code:
            self.status_label.setText("请输入卡密")
            self.status_label.setStyleSheet(f"color: {C.ERROR}; font-size: 12px;")
            return

        self.redeem_btn.setEnabled(False)
        self.status_label.setText("正在兑换...")
        self.status_label.setStyleSheet(f"color: {C.TEXT2}; font-size: 12px;")
        QApplication.processEvents()

        success, result = _redeem_card(code)
        self.redeem_btn.setEnabled(True)
        if not success:
            self.status_label.setText(result)
            self.status_label.setStyleSheet(f"color: {C.ERROR}; font-size: 12px;")
            return

        base_url_v1 = _get_base_url().rstrip("/") + "/v1"
        self.url_value.setText(base_url_v1)
        self.key_value.setText(result.get("key", ""))
        expires_at = result.get("expires_at", "")
        if expires_at:
            self.status_label.setText(f"兑换成功，到期 {_format_expires_for_display(expires_at)}")
        else:
            self.status_label.setText("兑换成功")
        self.status_label.setStyleSheet(f"color: {C.SUCCESS}; font-size: 12px;")


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    icon_path = _find_icon()
    if icon_path:
        app.setWindowIcon(QIcon(icon_path))
    font = QFont("Microsoft YaHei", 10)
    app.setFont(font)
    window = RedeemWindow()
    if icon_path:
        window.setWindowIcon(QIcon(icon_path))
    window.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
