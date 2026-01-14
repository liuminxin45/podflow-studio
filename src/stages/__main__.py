"""
Stage CLI 入口

支持以下方式运行:
    python -m src.stages run -d 2025-01-15
    python -m src.stages stage fetch -i input.json
    python -m src.stages list
    python -m src.stages schema fetch
"""

from src.stages.cli import main

if __name__ == "__main__":
    main()
