"""
Get available fetch sources.
This script is called by Electron to get the list of available data sources.
"""

import sys
import json
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from nodes.fetch.node import get_available_sources  # noqa: E402

if __name__ == "__main__":
    sources = get_available_sources()
    print(json.dumps(sources, ensure_ascii=False, indent=2))
