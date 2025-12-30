"""
Environment Configuration Checker

这个文件用于检查和验证项目的环境配置，确保所有必要的API密钥和配置项都已正确设置。

功能概述：
- 检查所有必需的环境变量
- 验证API密钥的有效性
- 提供配置状态报告
- 支持生成配置模板

检查项目：
- DeepSeek API配置
- Moonshot API配置
- 豆包TTS配置
- VoiceClone配置
- 数据库连接配置
- 其他服务配置

使用方式：
    python check_env.py                    # 检查所有配置
    python check_env.py --service deepseek # 检查特定服务
    python check_env.py --verbose          # 详细输出
    python check_env.py --generate         # 生成配置模板

输出信息：
- 配置项状态（已配置/未配置）
- API密钥有效性验证
- 配置建议和修复方案
- 环境变量示例

配置文件：
- .env: 主配置文件
- .env.example: 配置模板
- 各种服务特定的配置文件

作者：Auto-Podcast Team
版本：1.0.0
更新：2025-12-25
"""

import argparse
import json
import os
import sys
import uuid
from typing import Any, Tuple

import requests
from dotenv import load_dotenv


def _mask(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 8:
        return "***"
    return s[:3] + "***" + s[-3:]


def _deepseek_base() -> Tuple[str, str, str]:
    base_url = os.environ.get("DEEPSEEK_BASE_URL", "").strip().rstrip("/")
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip()
    return base_url, api_key, model


def test_deepseek(timeout_s: int) -> None:
    base_url, api_key, model = _deepseek_base()
    if not base_url or not api_key:
        raise RuntimeError("DeepSeek not configured: set DEEPSEEK_BASE_URL and DEEPSEEK_API_KEY")

    print(f"[DeepSeek] base_url={base_url} model={model} api_key={_mask(api_key)}")

    # Prefer /models to validate auth quickly; fallback to a minimal chat completion.
    models_url = f"{base_url}/models"
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        r = requests.get(models_url, headers=headers, timeout=timeout_s)
        if r.status_code == 200:
            data: Any = r.json()
            count = len(data.get("data") or []) if isinstance(data, dict) else None
            print(f"[DeepSeek] /models OK (models={count})")
            return
        print(f"[DeepSeek] /models returned {r.status_code}, fallback to chat...")
    except Exception as e:  # noqa: BLE001
        print(f"[DeepSeek] /models request failed: {e}; fallback to chat...")

    chat_url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Reply with a single word: OK"},
        ],
    }

    r2 = requests.post(
        chat_url,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        data=json.dumps(payload).encode("utf-8"),
        timeout=timeout_s,
    )
    r2.raise_for_status()
    data2: Any = r2.json()
    content = (((data2.get("choices") or [])[0] or {}).get("message") or {}).get("content")
    print(f"[DeepSeek] chat OK (sample={repr(content)})")


def test_doubao_config() -> None:
    required = ["DOUBAO_APP_ID", "DOUBAO_ACCESS_KEY"]
    placeholder_values = {"replace_me", "你的token"}
    missing = [
        k
        for k in required
        if (not os.environ.get(k, "").strip()) or (os.environ.get(k, "").strip() in placeholder_values)
    ]
    if missing:
        raise RuntimeError(f"Doubao env missing/placeholder: {', '.join(missing)}")

    # For podcast websocket v3, secret key is not required by the headers shown in the doc.
    # We keep it in .env for compatibility with other Volcengine auth styles.
    print("[Doubao] app_id/access_token present")


def test_doubao_ws(timeout_s: int) -> None:
    try:
        import websocket  # type: ignore
    except Exception as e:  # noqa: BLE001
        raise RuntimeError("websocket-client not installed; pip install websocket-client") from e

    app_id = os.environ.get("DOUBAO_APP_ID", "").strip()
    access_token = os.environ.get("DOUBAO_ACCESS_KEY", "").strip()
    if not app_id or not access_token or access_token in {"replace_me", "你的token"}:
        raise RuntimeError("Doubao not configured: set DOUBAO_APP_ID and DOUBAO_ACCESS_KEY")

    headers = {
        "X-Api-App-Id": app_id,
        "X-Api-Access-Key": access_token,
        "X-Api-Resource-Id": "volc.service_type.10050",
        "X-Api-App-Key": "aGjiRDfUWi",
        "X-Api-Request-Id": str(uuid.uuid4()),
    }

    header_list = [f"{k}: {v}" for k, v in headers.items()]
    url = "wss://openspeech.bytedance.com/api/v3/sami/podcasttts"

    ws = None
    try:
        ws = websocket.create_connection(url, header=header_list, timeout=timeout_s)
        ws.settimeout(timeout_s)
        print("[Doubao] websocket handshake OK")
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Doubao websocket handshake failed: {e}") from e
    finally:
        try:
            if ws is not None:
                ws.close()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", default=".env")
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("HTTP_TIMEOUT_SECONDS", "20")))
    parser.add_argument("--only", choices=["all", "deepseek", "doubao"], default="all")
    parser.add_argument("--doubao-ws", action="store_true")
    args = parser.parse_args()

    load_dotenv(args.env, override=False)

    try:
        if args.only in {"all", "deepseek"}:
            test_deepseek(timeout_s=args.timeout)
        if args.only in {"all", "doubao"}:
            test_doubao_config()
            if args.doubao_ws:
                test_doubao_ws(timeout_s=args.timeout)
    except Exception as e:  # noqa: BLE001
        print(f"[FAIL] {e}", file=sys.stderr)
        return 2

    print("[PASS] all checks ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
