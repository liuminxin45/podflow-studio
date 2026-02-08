"""
Extract schema information from node configuration classes.
Supports both Pydantic and dataclass-based configs.
"""
import importlib
import inspect
import sys
from pathlib import Path
from typing import Dict, Any, List, get_type_hints, get_origin, get_args
from dataclasses import fields, is_dataclass, MISSING
import json

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def get_type_info(type_hint) -> Dict[str, Any]:
    """Extract type information from a type hint."""
    origin = get_origin(type_hint)
    args = get_args(type_hint)
    
    # Handle Optional types
    if origin is type(None) or (origin and str(origin) == 'typing.Union' and type(None) in args):
        non_none_args = [arg for arg in args if arg is not type(None)]
        if non_none_args:
            base_type = get_type_info(non_none_args[0])
            base_type['optional'] = True
            return base_type
    
    # Handle List types
    if origin is list or (origin and str(origin) == 'typing.List'):
        item_type = args[0] if args else str
        return {
            'type': 'array',
            'items': get_type_info(item_type),
            'optional': False
        }
    
    # Handle Dict types
    if origin is dict or (origin and str(origin) == 'typing.Dict'):
        return {
            'type': 'object',
            'optional': False
        }
    
    # Basic types
    type_map = {
        str: 'string',
        int: 'integer',
        float: 'number',
        bool: 'boolean',
    }
    
    type_name = type_hint.__name__ if hasattr(type_hint, '__name__') else str(type_hint)
    return {
        'type': type_map.get(type_hint, type_name),
        'optional': False
    }


def extract_pydantic_schema(config_class) -> Dict[str, Any]:
    """Extract schema from Pydantic model."""
    schema = {
        'type': 'pydantic',
        'fields': {}
    }
    
    try:
        # Get model fields
        if hasattr(config_class, 'model_fields'):
            # Pydantic v2
            for field_name, field_info in config_class.model_fields.items():
                field_schema = {
                    'description': field_info.description or '',
                    'default': field_info.default if field_info.default is not None else None,
                    'required': field_info.is_required()
                }
                
                # Extract type info
                type_info = get_type_info(field_info.annotation)
                field_schema.update(type_info)
                
                # Extract constraints
                if hasattr(field_info, 'metadata'):
                    for constraint in field_info.metadata:
                        if hasattr(constraint, 'ge'):
                            field_schema['min'] = constraint.ge
                        if hasattr(constraint, 'le'):
                            field_schema['max'] = constraint.le
                        if hasattr(constraint, 'min_length'):
                            field_schema['minLength'] = constraint.min_length
                        if hasattr(constraint, 'max_length'):
                            field_schema['maxLength'] = constraint.max_length
                
                schema['fields'][field_name] = field_schema
        else:
            # Pydantic v1
            for field_name, field_info in config_class.__fields__.items():
                field_schema = {
                    'description': field_info.field_info.description or '',
                    'default': field_info.default if field_info.default is not None else None,
                    'required': field_info.required
                }
                
                type_info = get_type_info(field_info.outer_type_)
                field_schema.update(type_info)
                
                schema['fields'][field_name] = field_schema
    except Exception as e:
        print(f"Error extracting Pydantic schema: {e}", file=sys.stderr)
    
    return schema


def extract_dataclass_schema(config_class) -> Dict[str, Any]:
    """Extract schema from dataclass."""
    schema = {
        'type': 'dataclass',
        'fields': {}
    }
    
    try:
        type_hints = get_type_hints(config_class)
        
        for field in fields(config_class):
            field_type = type_hints.get(field.name, str)
            type_info = get_type_info(field_type)
            
            field_schema = {
                'description': '',
                'default': field.default if field.default is not MISSING else (
                    field.default_factory() if field.default_factory is not MISSING else None
                ),
                'required': field.default is MISSING and field.default_factory is MISSING
            }
            field_schema.update(type_info)
            
            schema['fields'][field.name] = field_schema
    except Exception as e:
        print(f"Error extracting dataclass schema: {e}", file=sys.stderr)
    
    return schema


def extract_node_config_schema(node_name: str) -> Dict[str, Any]:
    """Extract configuration schema for a specific node."""
    try:
        # Import the config module
        config_module = importlib.import_module(f'nodes.{node_name}.config')
        
        # Find the config class
        config_class = None
        for name, obj in inspect.getmembers(config_module):
            if inspect.isclass(obj) and 'Config' in name:
                config_class = obj
                break
        
        if not config_class:
            return {'error': f'No config class found for {node_name}'}
        
        # Check if it's Pydantic or dataclass
        if hasattr(config_class, '__fields__') or hasattr(config_class, 'model_fields'):
            return extract_pydantic_schema(config_class)
        elif is_dataclass(config_class):
            return extract_dataclass_schema(config_class)
        else:
            return {'error': f'Unknown config type for {node_name}'}
            
    except Exception as e:
        return {'error': str(e)}


def extract_all_schemas() -> Dict[str, Dict[str, Any]]:
    """Extract schemas for all nodes."""
    nodes_dir = project_root / 'nodes'
    schemas = {}
    
    for node_dir in nodes_dir.iterdir():
        if node_dir.is_dir() and not node_dir.name.startswith('_'):
            config_file = node_dir / 'config.py'
            if config_file.exists():
                node_name = node_dir.name
                schemas[node_name] = extract_node_config_schema(node_name)
    
    return schemas


if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Extract schema for specific node
        node_name = sys.argv[1]
        schema = extract_node_config_schema(node_name)
        print(json.dumps(schema, indent=2, default=str))
    else:
        # Extract all schemas
        schemas = extract_all_schemas()
        print(json.dumps(schemas, indent=2, default=str))
