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
        try:
            container_client.create_container()
            print(f"Container '{CONTAINER_NAME}' created.")
        except Exception as e:
            print(f"Could not create container (may already exist): {e}")


def upload_pdfs(client: BlobServiceClient):
    """Upload all PDF files from data/ and subdirectories to the blob container."""
    container_client = client.get_container_client(CONTAINER_NAME)

    # Collect PDFs from data/ and all subdirectories
    pdf_entries = []  # list of (filepath, blob_name)
    for root, _dirs, files in os.walk(DATA_DIR):
        for f in sorted(files):
            if f.lower().endswith(".pdf"):
                filepath = os.path.join(root, f)
                # Use the filename only (flat blob namespace)
                pdf_entries.append((filepath, f))

    if not pdf_entries:
        print(f"No PDF files found in {DATA_DIR}. Run generate_forms.py first.")
        sys.exit(1)

    print(f"Uploading {len(pdf_entries)} PDF files to container '{CONTAINER_NAME}'...")

    content_settings = ContentSettings(content_type="application/pdf")
    uploaded = 0

    for filepath, blob_name in pdf_entries:
        blob_client = container_client.get_blob_client(blob_name)

        with open(filepath, "rb") as f:
            blob_client.upload_blob(
                f,
                overwrite=True,
                content_settings=content_settings,
            )
        uploaded += 1
        if uploaded % 10 == 0:
            print(f"  Uploaded {uploaded}/{len(pdf_entries)}...")

    print(f"\nDone! Uploaded {uploaded} files to "
          f"{BLOB_URL}/{CONTAINER_NAME}/")


def main():
    client = get_blob_service_client()
    ensure_container(client)
    upload_pdfs(client)


if __name__ == "__main__":
    main()
