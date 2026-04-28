# Architecture Diagram

## AI Document Intelligence - Tax Form Processing

```mermaid
graph LR
    subgraph Users
        Admin["👤 Admin / Reviewers"]
    end

    subgraph Azure["Azure Subscription (ai-myaacoub)"]

        subgraph UI["Static Web App"]
            ReactUI["React UI<br/>Document Review Portal"]
        end

        subgraph API["App Service"]
            FastAPI["FastAPI Backend<br/>api-taxforms"]
        end

        subgraph VNet["Private Virtual Network"]
            subgraph PrivateEndpoints["Private Endpoints"]
                PE_Storage["🔒 PE - Storage"]
                PE_Cosmos["🔒 PE - Cosmos DB"]
                PE_AI["🔒 PE - AI Services"]
            end

            subgraph Storage["Azure Blob Storage"]
                Blob["aistoragemyaacoub<br/>📦 tax-forms container<br/>100 Tax Exemption PDFs"]
            end

            subgraph CosmosDB["Azure Cosmos DB"]
                Cosmos["taxforms database<br/>📊 documents container<br/>Parsed results + corrections"]
            end
        end

        subgraph AIServices["Azure AI Services"]
            DocIntel["🧠 Document Intelligence<br/>001-ai-poc<br/>Form extraction & OCR"]
        end

        subgraph Search["Azure AI Search"]
            SearchIdx["🔍 Parsed Document Index<br/>Full-text search"]
        end

        subgraph Foundry["Azure AI Foundry"]
            Agent["🤖 AI Foundry Agent<br/>001-ai-proj"]
        end
    end

    Admin --> ReactUI
    ReactUI --> FastAPI
    FastAPI --> PE_Storage --> Blob
    FastAPI --> PE_Cosmos --> Cosmos
    FastAPI --> PE_AI --> DocIntel
    Blob -.->|Parse PDFs| DocIntel
    DocIntel -.->|Store results| Cosmos
    Cosmos -.->|Index| SearchIdx
    Agent -.->|Orchestrate| DocIntel

    style VNet fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style PrivateEndpoints fill:#fff3e0,stroke:#e65100
    style Storage fill:#e8f5e9,stroke:#2e7d32
    style CosmosDB fill:#fce4ec,stroke:#c62828
    style AIServices fill:#f3e5f5,stroke:#7b1fa2
    style Search fill:#e0f7fa,stroke:#00838f
    style Foundry fill:#fff8e1,stroke:#f57f17
```

## Data Flow

1. **Generate**: Python script creates 100 handwritten-style tax exemption PDFs (2 per US state)
2. **Upload**: PDFs uploaded to Azure Blob Storage `tax-forms` container via private endpoint
3. **Parse**: AI Document Intelligence extracts fields, sections, and confidence scores
4. **Store**: Results stored in Cosmos DB with hierarchical structure (document → section → field)
5. **Review**: React UI displays documents grouped by confidence category (Blue/Green/Yellow/Red)
6. **Correct**: Admin edits field values — corrections stored for model retraining
7. **Search**: AI Search indexes parsed data for full-text queries

## Confidence Score Categories

| Color | Range | Label |
|-------|-------|-------|
| 🔵 Blue | > 90% | Outstanding - Very high confidence |
| 🟢 Green | > 80% | High confidence |
| 🟡 Yellow | > 60% | Medium confidence |
| 🔴 Red | ≤ 60% | Needs Review - Low confidence |

## Security

- **Managed Identity**: All service-to-service communication uses system-assigned managed identity
- **Private Endpoints**: Storage, Cosmos DB, and AI Services accessed via private endpoints within VNet
- **RBAC**: Least-privilege role assignments (Storage Blob Data Contributor, Cognitive Services User, Cosmos DB Data Contributor)
- **No keys**: `disableLocalAuth: true` on Cosmos DB; Entra-only authentication

> **Note**: To generate a PNG version of this diagram with Azure icons, run:
> ```bash
> pip install diagrams
> python scripts/generate_architecture.py
> ```
> Requires [Graphviz](https://graphviz.org/download/) installed on your system.
