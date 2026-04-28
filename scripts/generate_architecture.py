"""
Generate an architecture diagram PNG using the 'diagrams' library.
The diagram includes: Private VNet, Private Endpoints, AI Search,
Storage Account, Document Intelligence, Cosmos DB, App Service, Foundry Agent.

Install: pip install diagrams
Requires: Graphviz (https://graphviz.org/download/)
"""

import os

try:
    from diagrams import Diagram, Cluster, Edge
    from diagrams.azure.network import VirtualNetworks, PrivateEndpoint, ApplicationGateway
    from diagrams.azure.storage import StorageAccounts, BlobStorage
    from diagrams.azure.database import CosmosDb
    from diagrams.azure.ml import CognitiveServices
    from diagrams.azure.web import AppServices
    from diagrams.azure.analytics import AnalysisServices
    from diagrams.azure.security import KeyVaults
    from diagrams.azure.devops import Repos
    from diagrams.onprem.client import Users
except ImportError:
    print("Install required packages: pip install diagrams")
    print("Also install Graphviz: https://graphviz.org/download/")
    exit(1)

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs")


def main():
    os.makedirs(DOCS_DIR, exist_ok=True)
    output_path = os.path.join(DOCS_DIR, "architecture")

    with Diagram(
        "AI Document Intelligence - Tax Form Processing",
        filename=output_path,
        show=False,
        direction="LR",
        outformat="png",
    ):
        users = Users("Admin / Reviewers")

        with Cluster("Azure Subscription\nResource Group: ai-myaacoub"):

            with Cluster("Private Virtual Network"):
                with Cluster("Private Endpoints"):
                    pe_storage = PrivateEndpoint("PE - Storage")
                    pe_cosmos = PrivateEndpoint("PE - Cosmos DB")
                    pe_ai = PrivateEndpoint("PE - AI Services")

                blob = BlobStorage("Blob Storage\naistoragemyaacoub\ntax-forms container")
                cosmos = CosmosDb("Cosmos DB\ntaxforms database")

            ai_services = CognitiveServices("AI Document\nIntelligence\n001-ai-poc")
            ai_search = AnalysisServices("Azure AI Search\nParsed Document Index")
            foundry = CognitiveServices("AI Foundry Agent\n001-ai-proj")

            app_api = AppServices("App Service\nFastAPI Backend")
            app_ui = AppServices("Static Web App\nReact UI")

        # Connections
        users >> app_ui >> app_api

        app_api >> pe_storage >> blob
        app_api >> pe_cosmos >> cosmos
        app_api >> pe_ai >> ai_services

        blob >> ai_services
        ai_services >> cosmos
        cosmos >> ai_search
        foundry >> ai_services

    print(f"Architecture diagram saved to {output_path}.png")


if __name__ == "__main__":
    main()
