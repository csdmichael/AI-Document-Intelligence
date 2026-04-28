"""
Upload PDF forms from the data/ folder to Azure Blob Storage container 'tax-forms'.
Uses managed identity (DefaultAzureCredential) for authentication.
Supports private endpoint / VNet access.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient, ContentSettings
from config import cfg

CONTAINER_NAME = cfg.azure.storage.container_name
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
BLOB_URL = cfg.blob_url


def get_blob_service_client() -> BlobServiceClient:
    """Create BlobServiceClient using managed identity."""
    credential = DefaultAzureCredential()
    return BlobServiceClient(account_url=BLOB_URL, credential=credential)


def ensure_container(client: BlobServiceClient):
    """Create the container if it does not exist."""
    container_client = client.get_container_client(CONTAINER_NAME)
    try:
        container_client.get_container_properties()
        print(f"Container '{CONTAINER_NAME}' already exists.")
    except Exception:
        container_client.create_container()
        print(f"Container '{CONTAINER_NAME}' created.")


def upload_pdfs(client: BlobServiceClient):
    """Upload all PDF files from data/ to the blob container."""
    container_client = client.get_container_client(CONTAINER_NAME)
    pdf_files = sorted(f for f in os.listdir(DATA_DIR) if f.lower().endswith(".pdf"))

    if not pdf_files:
        print(f"No PDF files found in {DATA_DIR}. Run generate_forms.py first.")
        sys.exit(1)

    print(f"Uploading {len(pdf_files)} PDF files to container '{CONTAINER_NAME}'...")

    content_settings = ContentSettings(content_type="application/pdf")
    uploaded = 0

    for filename in pdf_files:
        filepath = os.path.join(DATA_DIR, filename)
        blob_client = container_client.get_blob_client(filename)

        with open(filepath, "rb") as f:
            blob_client.upload_blob(
                f,
                overwrite=True,
                content_settings=content_settings,
            )
        uploaded += 1
        if uploaded % 10 == 0:
            print(f"  Uploaded {uploaded}/{len(pdf_files)}...")

    print(f"\nDone! Uploaded {uploaded} files to "
          f"{BLOB_URL}/{CONTAINER_NAME}/")


def main():
    client = get_blob_service_client()
    ensure_container(client)
    upload_pdfs(client)


if __name__ == "__main__":
    main()
