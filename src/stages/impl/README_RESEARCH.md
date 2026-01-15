# Research Stage Configuration

## Overview

The Research stage performs background research on selected topics using web search APIs. It is now **decoupled from .env** and can be configured independently.

## Supported Providers

- **metaso**: MetaSo search API
- **anspire**: Anspire search API  
- **bocha**: Bocha web search API (supports both web-search and ai-search)

## Configuration Priority

The Research stage loads configuration in the following priority order:

1. **Environment Variables** (highest priority)
2. **Configuration File** (`config/optimized_settings.yaml`)
3. **Default Values** (lowest priority)

## Configuration File

Edit `config/optimized_settings.yaml`:

```yaml
research:
  enabled: true                # Enable/disable research stage
  provider: anspire           # Provider: metaso, anspire, or bocha
  max_items: 10               # Maximum items to research
  max_sources: 3              # Maximum sources per item
  timeout_seconds: 60         # Timeout per request
  max_retries: 3              # Maximum retry attempts
  retry_delay: 1.0            # Delay between retries (seconds)
  
  # Provider-specific settings
  metaso:
    model: fast               # Model: fast or standard
  
  anspire:
    top_k: 5                  # Number of top results
    is_stream: false          # Use streaming mode
  
  bocha:
    api_type: web-search      # API type: web-search or ai-search
    count: 10                 # Number of results
    summary: true             # Include summaries
    freshness: noLimit        # Freshness filter
```

## Environment Variables (Optional)

You can override configuration using environment variables:

```bash
# General settings
RESEARCH_ENABLED=true
RESEARCH_PROVIDER=anspire
RESEARCH_MAX_TOTAL_CLAIMS=20
RESEARCH_MAX_CLAIMS_PER_ITEM=5
RESEARCH_MIN_CLAIM_CONFIDENCE=0.6
RESEARCH_INCLUDE_OPINIONS=false
RESEARCH_INCLUDE_CONTRAST_QUERIES=true

# Provider-specific API keys
METASO_API_KEY=your_key_here
ANSPIRE_API_KEY=your_key_here
BOCHA_API_KEY=your_key_here

# Provider-specific settings
METASO_MODEL=fast
ANSPIRE_TOP_K=5
BOCHA_API_TYPE=web-search
```

## Frontend Configuration

The Research stage can be configured through the web UI:

1. Navigate to the Research stage
2. Click the configuration panel
3. Toggle "Research Enabled" to enable/disable
4. Select provider from dropdown (metaso, anspire, bocha)
5. Adjust other parameters as needed
6. Click "Save Configuration"

## Independent Execution

The Research stage can run independently without relying on global `.env` files:

```python
from src.stages.impl.research_config import load_research_stage_config

# Load config from file or environment
config = load_research_stage_config()

# Or specify a custom config file
config = load_research_stage_config("path/to/custom_config.yaml")
```

## Troubleshooting

### Research stage not running

1. Check that `enabled: true` in config file
2. Verify the provider is correctly set
3. Check API keys are configured for the selected provider
4. Review logs for configuration details

### Provider errors

1. Ensure API keys are set for the selected provider
2. Verify provider name is correct (metaso, anspire, or bocha)
3. Check provider-specific settings in config file

## Migration from .env

If you were using `.env` for research configuration:

1. Move settings from `.env` to `config/optimized_settings.yaml`
2. Update provider names if needed (google/bing → metaso/anspire/bocha)
3. Remove old `RESEARCH_*` variables from `.env` (optional)
4. Test configuration through the UI

## Logging

The Research stage logs its configuration on startup:

```
Research config: enabled=True, provider=anspire, max_total_claims=20, max_claims_per_item=5
```

Check these logs to verify your configuration is being loaded correctly.
