# Fixes Summary - 2026-01-15

## Issues Fixed

### 1. ✅ Global Configuration Panel in Frontend

**Problem**: Frontend had no way to configure global parameters (LLM, Channel, etc.)

**Solution**:
- Created `frontend/src/components/GlobalConfig.tsx` - New component for global configuration
- Added backend endpoints:
  - `GET /global/config` - Retrieve global configuration
  - `PUT /global/config` - Update global configuration
- Updated `App.tsx` to render GlobalConfig when "Global Config" is selected
- Updated `Sidebar.tsx` to add "Global Config" menu item with Settings icon

**Files Modified**:
- `frontend/src/components/GlobalConfig.tsx` (new)
- `frontend/src/App.tsx`
- `frontend/src/components/Sidebar.tsx`
- `src/stages/api.py` (added global config endpoints)

**Usage**:
- Click "Global Config" in the sidebar
- Configure LLM settings (provider, model, temperature, max_tokens, timeout)
- Configure Channel settings (id, name, language)
- Changes are saved to `config/optimized_settings.yaml`

---

### 2. ✅ Research Output Bug - Showing Input Data

**Problem**: Research stage output was displaying input data even when the stage hadn't run yet

**Solution**:
- Modified `get_stage_output()` endpoint in `src/stages/api.py`
- Now returns empty dict `{}` when output is `None` instead of returning `None`
- Prevents frontend from incorrectly displaying input as output

**Files Modified**:
- `src/stages/api.py` (lines 492-509)

**Code Change**:
```python
# Don't return anything if stage hasn't run yet
if output is None:
    output = {}
```

---

### 3. ✅ Research Validation Error - Claim Field

**Problem**: Research stage failed with validation error:
```
1 validation error for EvidencePackSchema
claim
  Input should be a valid string [type=string_type, input_value={'text': '📅 2026-01-15...}]
```

**Root Cause**: The `claim` field in evidence packs was a dict object (from `Claim.to_dict()`) but the schema expected a string.

**Solution**:
- Updated `research_stage.py` to extract claim text from dict format
- Added handling for both dict and string formats:
  ```python
  claim_data = pack.get("claim", "")
  if isinstance(claim_data, dict):
      claim_text = claim_data.get("text", "")
  else:
      claim_text = str(claim_data)
  ```
- Applied fix in two locations where evidence packs are created

**Files Modified**:
- `src/stages/impl/research_stage.py` (lines 137-149, 164-169)

---

### 4. ✅ Bocha Provider Options

**Problem**: Research provider dropdown only showed `bocha` but should have separate options for `bocha-web` and `bocha-ai`

**Solution**:
- Updated `StageConfig.tsx` to include all bocha variants
- Provider options now: `['metaso', 'anspire', 'bocha', 'bocha-web', 'bocha-ai']`

**Files Modified**:
- `frontend/src/components/StageConfig.tsx` (line 57)

**Available Providers**:
- `metaso` - Metaso search
- `anspire` - Anspire search agent
- `bocha` - Bocha (default mode)
- `bocha-web` - Bocha web search
- `bocha-ai` - Bocha AI search

---

## Testing Recommendations

### 1. Test Global Config
```bash
# Start frontend
cd frontend
npm run dev

# Navigate to "Global Config" in sidebar
# Modify LLM settings
# Verify changes are saved to config/optimized_settings.yaml
```

### 2. Test Research Stage
```bash
# Run research stage with bocha provider
# Verify no validation errors
# Check that evidence packs are created correctly
# Verify output is empty before running
```

### 3. Test Provider Switching
```bash
# In frontend, go to Research stage config
# Switch between providers: metaso, anspire, bocha, bocha-web, bocha-ai
# Run research stage with each provider
# Verify all work correctly
```

---

## Related Documentation

- `STAGE_CONFIG_MIGRATION_SUMMARY.md` - Stage configuration decoupling
- `src/stages/impl/README_STAGE_CONFIG.md` - Stage configuration system
- `src/stages/impl/README_RESEARCH.md` - Research stage documentation
- `src/config/global_config.py` - Global configuration module

---

## API Endpoints Added

### Global Configuration
- `GET /global/config` - Get global configuration (LLM, Channel, Output)
- `PUT /global/config` - Update global configuration

### Example Request
```bash
curl -X PUT http://localhost:8000/global/config \
  -H "Content-Type: application/json" \
  -d '{
    "llm": {
      "provider": "deepseek",
      "model": "deepseek-chat",
      "temperature": 0.7
    }
  }'
```

---

## Frontend Components Added

### GlobalConfig Component
- Location: `frontend/src/components/GlobalConfig.tsx`
- Features:
  - Load global configuration from backend
  - Edit LLM settings (provider, model, temperature, max_tokens, timeout)
  - Edit Channel settings (id, name, language)
  - Save changes to backend
  - Integrated with existing ConfigEditor component

---

## Summary

All 4 issues have been successfully resolved:

1. ✅ **Global Config Panel** - Frontend can now configure global parameters
2. ✅ **Research Output Bug** - Fixed output showing input data before execution
3. ✅ **Research Validation Error** - Fixed claim field type mismatch
4. ✅ **Bocha Provider Options** - Added bocha-web and bocha-ai to dropdown

The system is now ready for testing with all fixes applied.
