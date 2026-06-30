"""
Configuration validator for nodes.
Validates that all required parameters are provided before node execution.
"""

from typing import Any
from pydantic import ValidationError


def validate_node_config(config_class, config_data: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Validate node configuration.

    Args:
        config_class: The configuration class (Pydantic model)
        config_data: The configuration data to validate

    Returns:
        Tuple of (is_valid, error_messages)
    """
    errors = []

    try:
        # Try to create config instance
        config_class(**config_data)
        return True, []
    except ValidationError as e:
        # Extract validation errors
        for error in e.errors():
            field = ".".join(str(loc) for loc in error["loc"])
            msg = error["msg"]
            errors.append(f"Field '{field}': {msg}")
        return False, errors
    except Exception as e:
        errors.append(f"Validation error: {str(e)}")
        return False, errors


def get_required_fields(config_class) -> list[str]:
    """
    Get list of required fields from a Pydantic config class.

    Args:
        config_class: The configuration class

    Returns:
        List of required field names
    """
    required = []

    if hasattr(config_class, "model_fields"):
        for field_name, field_info in config_class.model_fields.items():
            if field_info.is_required():
                required.append(field_name)

    return required


def check_missing_required_fields(config_class, config_data: dict[str, Any]) -> list[str]:
    """
    Check for missing required fields.

    Args:
        config_class: The configuration class
        config_data: The configuration data

    Returns:
        List of missing required field names
    """
    required_fields = get_required_fields(config_class)
    missing = []

    for field in required_fields:
        if field not in config_data or config_data[field] is None or config_data[field] == "":
            missing.append(field)

    return missing
