"""Application configuration — delegates to centralized config/ loader."""

import sys
import os

# Ensure the project root is on sys.path so 'config' package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import cfg

STORAGE_ACCOUNT_NAME = cfg.azure.storage.account_name
STORAGE_CONTAINER_NAME = cfg.azure.storage.container_name
BLOB_URL = cfg.blob_url

DOCUMENT_INTELLIGENCE_ENDPOINT = cfg.di_endpoint

COSMOS_ENDPOINT = cfg.cosmos_endpoint
COSMOS_DATABASE = cfg.azure.cosmos_db.database
COSMOS_CONTAINER = cfg.azure.cosmos_db.container

API_HOST = cfg.app.api.host
API_PORT = cfg.app.api.port
CORS_ORIGINS = cfg.app.api.cors_origins
