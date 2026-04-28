"""
Centralized configuration loader.

Loads YAML config files from the config/ folder and merges with
environment variable overrides. Environment variables take precedence.

Usage:
    from config import cfg

    endpoint = cfg.azure.cosmos_db.endpoint
    model_id = cfg.doc_intelligence.model.model_id
"""

import os
import yaml
from pathlib import Path
from types import SimpleNamespace
from dotenv import load_dotenv

load_dotenv()

CONFIG_DIR = Path(__file__).parent


def _dict_to_namespace(d: dict) -> SimpleNamespace:
    """Recursively convert a dict to a SimpleNamespace for dot-access."""
    ns = SimpleNamespace()
    for key, value in d.items():
        if isinstance(value, dict):
            setattr(ns, key, _dict_to_namespace(value))
        elif isinstance(value, list):
            setattr(ns, key, [
                _dict_to_namespace(item) if isinstance(item, dict) else item
                for item in value
            ])
        else:
            setattr(ns, key, value)
    return ns


def _load_yaml(filename: str) -> dict:
    """Load a YAML file from the config directory."""
    filepath = CONFIG_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Config file not found: {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _apply_env_overrides(data: dict) -> dict:
    """
    Apply environment variable overrides.
    Env var naming convention: section keys joined by underscore, uppercased.
    E.g., AZURE_STORAGE_ACCOUNT_NAME overrides azure.storage.account_name
    """
    env_map = {
        # Azure Resources
        "AZURE_STORAGE_ACCOUNT_NAME": ("storage", "account_name"),
        "AZURE_STORAGE_CONTAINER_NAME": ("storage", "container_name"),
        "AZURE_COSMOS_ENDPOINT": ("cosmos_db", "endpoint"),
        "AZURE_COSMOS_ACCOUNT_NAME": ("cosmos_db", "account_name"),
        "AZURE_COSMOS_DATABASE": ("cosmos_db", "database"),
        "AZURE_COSMOS_CONTAINER": ("cosmos_db", "container"),
        "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT": ("ai_services", "endpoint"),
        "AZURE_AI_FOUNDRY_ENDPOINT": ("ai_foundry", "endpoint"),
        "AZURE_SUBSCRIPTION_ID": ("subscription", "id"),
        "AZURE_RESOURCE_GROUP": ("subscription", "resource_group"),
        "AZURE_LOCATION": ("subscription", "location"),
    }

    for env_var, path in env_map.items():
        value = os.getenv(env_var)
        if value is not None:
            obj = data
            for key in path[:-1]:
                obj = obj.setdefault(key, {})
            obj[path[-1]] = value

    return data


class Config:
    """Application configuration loaded from YAML + env overrides."""

    def __init__(self):
        # Load Azure resource config
        azure_data = _load_yaml("azure_resources.yaml")
        azure_data = _apply_env_overrides(azure_data)
        self.azure = _dict_to_namespace(azure_data)

        # Load Document Intelligence config
        di_data = _load_yaml("doc_intelligence.yaml")
        # Env override for model ID
        model_id = os.getenv("DOC_INTELLIGENCE_MODEL_ID")
        if model_id:
            di_data.setdefault("model", {})["model_id"] = model_id
        self.doc_intelligence = _dict_to_namespace(di_data)

        # Load app settings
        app_data = _load_yaml("app_settings.yaml")
        # Env overrides for API
        host = os.getenv("API_HOST")
        if host:
            app_data.setdefault("api", {})["host"] = host
        port = os.getenv("API_PORT")
        if port:
            app_data.setdefault("api", {})["port"] = int(port)
        self.app = _dict_to_namespace(app_data)

    # ----- Convenience properties -----

    @property
    def blob_url(self) -> str:
        return f"https://{self.azure.storage.account_name}.blob.core.windows.net"

    @property
    def cosmos_endpoint(self) -> str:
        return self.azure.cosmos_db.endpoint

    @property
    def di_endpoint(self) -> str:
        return self.azure.ai_services.endpoint

    def get_confidence_category(self, score: float) -> str:
        """Map a confidence score to its color category name."""
        thresholds = self.doc_intelligence.confidence_thresholds
        if score > thresholds.blue.min_score:
            return "Blue"
        elif score > thresholds.green.min_score:
            return "Green"
        elif score > thresholds.yellow.min_score:
            return "Yellow"
        return "Red"

    def get_confidence_label(self, category: str) -> str:
        """Get human-readable label for a confidence category."""
        thresholds = self.doc_intelligence.confidence_thresholds
        mapping = {
            "Blue": thresholds.blue.label,
            "Green": thresholds.green.label,
            "Yellow": thresholds.yellow.label,
            "Red": thresholds.red.label,
        }
        return mapping.get(category, "Unknown")

    def get_section_name(self, field_name: str) -> str:
        """Determine section name from a field name using keyword mapping."""
        field_lower = field_name.lower()
        mapping = self.doc_intelligence.section_mapping
        for _key, section in vars(mapping).items():
            for keyword in section.keywords:
                if keyword in field_lower:
                    return section.section_name
        return "General Information"


# Singleton instance — import this from other modules
cfg = Config()
