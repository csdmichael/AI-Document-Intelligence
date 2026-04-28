"""
Initialize Azure Cosmos DB database and container for storing parsed document results.
Uses managed identity (DefaultAzureCredential).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from azure.identity import DefaultAzureCredential
from azure.cosmos import CosmosClient, PartitionKey
from config import cfg

COSMOS_ENDPOINT = cfg.cosmos_endpoint
COSMOS_DATABASE = cfg.azure.cosmos_db.database
COSMOS_CONTAINER = cfg.azure.cosmos_db.container
PARTITION_KEY = cfg.azure.cosmos_db.partition_key
THROUGHPUT = cfg.azure.cosmos_db.throughput


def main():
    credential = DefaultAzureCredential()
    client = CosmosClient(url=COSMOS_ENDPOINT, credential=credential)

    # Create database
    print(f"Creating database '{COSMOS_DATABASE}'...")
    database = client.create_database_if_not_exists(id=COSMOS_DATABASE)
    print(f"  Database '{COSMOS_DATABASE}' ready.")

    # Create container with partition key
    print(f"Creating container '{COSMOS_CONTAINER}'...")
    container = database.create_container_if_not_exists(
        id=COSMOS_CONTAINER,
        partition_key=PartitionKey(path=PARTITION_KEY),
        offer_throughput=THROUGHPUT,
    )
    print(f"  Container '{COSMOS_CONTAINER}' ready (partition key: {PARTITION_KEY}).")

    # Create indexing policy optimized for queries
    print("  Default indexing policy applied (all paths indexed).")
    print(f"\nCosmos DB setup complete!")
    print(f"  Endpoint: {COSMOS_ENDPOINT}")
    print(f"  Database: {COSMOS_DATABASE}")
    print(f"  Container: {COSMOS_CONTAINER}")


if __name__ == "__main__":
    main()
